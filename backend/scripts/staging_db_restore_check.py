"""Verify that the newest staging PostgreSQL backup can be restored safely."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
import json
import hashlib
import os
from pathlib import Path
import re
import secrets
import subprocess
import sys
import tempfile
import time


POSTGRES_IMAGE = (
    "postgres:16@sha256:"
    "f1c3376c26f2609ab9f29f71f824103fe2fcd8ee0346485cb6122a4f93df6f94"
)
REQUIRED_TABLES = (
    "django_migrations",
    "metrics_metric_entry",
    "subscriptions_stripe_webhook_event",
    "subscriptions_subscription",
    "users_user",
)
BACKUP_BUCKET = "syncvitals-staging-backups-173291122778-eu-central-1-an"
BACKUP_PREFIX = "postgresql/"
AWS_REGION = "eu-central-1"
INSTANCE_ID_PATH = Path("/var/lib/cloud/data/instance-id")
LAST_SUCCESS_MONTH = Path("/var/lib/syncvitals/last-restore-success-month")


class RestoreCheckError(RuntimeError):
    """Report a failed backup restore verification."""


def select_latest_backup(listing: str) -> str:
    """Return the newest S3 object key from a ListObjectsV2 response."""

    try:
        contents = json.loads(listing)["Contents"]
        newest = max(contents, key=lambda item: item["LastModified"])
        key = newest["Key"]
        if not isinstance(key, str) or not key:
            raise ValueError
    except (json.JSONDecodeError, KeyError, TypeError, ValueError):
        raise RestoreCheckError("backup listing is empty or invalid") from None
    return key


def verify_checksum(dump: Path, head_object: str) -> str:
    """Require the downloaded dump to match its S3 SHA-256 metadata."""

    try:
        expected = json.loads(head_object)["Metadata"]["sha256"]
        if (
            not isinstance(expected, str)
            or re.fullmatch(r"[0-9a-f]{64}", expected) is None
        ):
            raise ValueError
    except (json.JSONDecodeError, KeyError, TypeError, ValueError):
        raise RestoreCheckError("backup checksum metadata is missing or invalid") from None

    with dump.open("rb") as backup:
        actual = hashlib.file_digest(backup, "sha256").hexdigest()
    if actual != expected:
        raise RestoreCheckError("backup checksum mismatch")
    return actual


def run_command(
    command: list[str],
    *,
    check: bool = True,
    environment: dict[str, str] | None = None,
) -> subprocess.CompletedProcess[str]:
    """Run one bounded host command without echoing its environment."""

    return subprocess.run(
        command,
        capture_output=True,
        check=check,
        env=environment,
        text=True,
        timeout=120,
    )


def restore_dump(dump: Path, container: str) -> int:
    """Restore and validate a dump in a network-isolated disposable database."""

    password = secrets.token_urlsafe(32)
    environment = {**os.environ, "POSTGRES_PASSWORD": password}
    started = False
    required_names = ",".join(f"'{name}'" for name in REQUIRED_TABLES)
    required_query = (
        "SELECT COUNT(*) FROM pg_tables "
        "WHERE schemaname='public' AND tablename IN "
        f"({required_names})"
    )
    try:
        run_command(
            [
                "docker",
                "run",
                "-d",
                "--rm",
                "--name",
                container,
                "--network=none",
                "--tmpfs",
                "/var/lib/postgresql/data:rw,nosuid,nodev,size=512m",
                "-e",
                "POSTGRES_PASSWORD",
                POSTGRES_IMAGE,
            ],
            environment=environment,
        )
        started = True
        for _ in range(60):
            readiness = run_command(
                ["docker", "exec", container, "pg_isready", "-U", "postgres"],
                check=False,
            )
            if readiness.returncode == 0:
                break
            time.sleep(1)
        else:
            raise RestoreCheckError("temporary PostgreSQL did not become ready")

        run_command(
            ["docker", "exec", container, "createdb", "-U", "postgres", "longevity"]
        )
        run_command(["docker", "cp", str(dump), f"{container}:/tmp/backup.dump"])
        run_command(
            [
                "docker",
                "exec",
                container,
                "pg_restore",
                "-e",
                "-O",
                "-x",
                "-U",
                "postgres",
                "-d",
                "longevity",
                "/tmp/backup.dump",
            ]
        )
        table_count = run_command(
            [
                "docker",
                "exec",
                container,
                "psql",
                "-U",
                "postgres",
                "-d",
                "longevity",
                "-Atqc",
                required_query,
            ]
        ).stdout.strip()
        if table_count != str(len(REQUIRED_TABLES)):
            raise RestoreCheckError("restored database is missing required tables")
        migration_count = run_command(
            [
                "docker",
                "exec",
                container,
                "psql",
                "-U",
                "postgres",
                "-d",
                "longevity",
                "-Atqc",
                "SELECT COUNT(*) FROM django_migrations",
            ]
        ).stdout.strip()
        try:
            migrations = int(migration_count)
        except ValueError:
            raise RestoreCheckError("restored migration count is invalid") from None
        if migrations < 1:
            raise RestoreCheckError("restored database has no migrations")
        return migrations
    except (OSError, subprocess.SubprocessError) as error:
        raise RestoreCheckError("restore command failed") from error
    finally:
        if started:
            run_command(["docker", "rm", "-f", container], check=False)


def read_instance_id() -> str:
    """Read and validate the local EC2 instance identifier."""

    try:
        instance_id = INSTANCE_ID_PATH.read_text(encoding="utf-8").strip()
    except OSError:
        raise RestoreCheckError("EC2 instance ID is unavailable") from None
    if re.fullmatch(r"i-[0-9a-f]+", instance_id) is None:
        raise RestoreCheckError("EC2 instance ID is invalid")
    return instance_id


def publish_metric(
    instance_id: str,
    value: int,
    metric_name: str = "StagingDatabaseRestoreSuccess",
) -> None:
    """Publish the restore result with the existing low-cardinality dimension."""

    run_command(
        [
            "aws",
            "cloudwatch",
            "put-metric-data",
            "--namespace",
            "CWAgent",
            "--metric-name",
            metric_name,
            "--dimensions",
            f"InstanceId={instance_id}",
            "--value",
            str(value),
            "--unit",
            "Count",
            "--region",
            AWS_REGION,
        ]
    )


def record_success_month(marker: Path, now: datetime) -> None:
    """Atomically record a completed restore's UTC calendar month."""

    marker.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    descriptor, filename = tempfile.mkstemp(
        prefix=".last-restore-",
        dir=marker.parent,
    )
    temporary = Path(filename)
    try:
        with os.fdopen(descriptor, "w", encoding="ascii") as output:
            output.write(now.astimezone(timezone.utc).strftime("%Y-%m\n"))
        os.chmod(temporary, 0o600)
        os.replace(temporary, marker)
    finally:
        temporary.unlink(missing_ok=True)


def restore_freshness_value(marker: Path, now: datetime) -> int:
    """Return one only if a restore has succeeded for the due UTC month."""

    current = now.astimezone(timezone.utc)
    due = current
    if current.day == 1 and current.hour < 6:
        due = current.replace(day=1) - timedelta(days=1)
    try:
        recorded = marker.read_text(encoding="ascii").strip()
    except (OSError, UnicodeError):
        return 0
    return int(recorded == due.strftime("%Y-%m"))


def freshness_main(now: datetime | None = None) -> int:
    """Publish the latest restore's monthly freshness every six hours."""

    try:
        instance_id = read_instance_id()
        value = restore_freshness_value(
            LAST_SUCCESS_MONTH,
            now if now is not None else datetime.now(timezone.utc),
        )
        publish_metric(instance_id, value, "StagingDatabaseRestoreFresh")
    except (RestoreCheckError, OSError, subprocess.SubprocessError) as error:
        print(f"restore_freshness=failed reason={error}", file=sys.stderr)
        return 1
    print("restore_freshness=ok" if value else "restore_freshness=stale")
    return 0


def main(temp_directory: Path = Path("/var/tmp")) -> int:
    """Download and test the latest backup, then publish one result metric."""

    instance_id = ""
    dump: Path | None = None
    try:
        instance_id = read_instance_id()
        listing = run_command(
            [
                "aws",
                "s3api",
                "list-objects-v2",
                "--bucket",
                BACKUP_BUCKET,
                "--prefix",
                BACKUP_PREFIX,
                "--region",
                AWS_REGION,
                "--output",
                "json",
            ]
        ).stdout
        key = select_latest_backup(listing)
        head_object = run_command(
            [
                "aws",
                "s3api",
                "head-object",
                "--bucket",
                BACKUP_BUCKET,
                "--key",
                key,
                "--region",
                AWS_REGION,
                "--output",
                "json",
            ]
        ).stdout
        descriptor, filename = tempfile.mkstemp(
            prefix="syncvitals-restore-",
            suffix=".dump",
            dir=temp_directory,
        )
        os.close(descriptor)
        dump = Path(filename)
        dump.chmod(0o600)
        run_command(
            [
                "aws",
                "s3api",
                "get-object",
                "--bucket",
                BACKUP_BUCKET,
                "--key",
                key,
                "--region",
                AWS_REGION,
                str(dump),
            ]
        )
        verify_checksum(dump, head_object)
        migrations = restore_dump(dump, f"syncvitals-restore-check-{os.getpid()}")
        publish_metric(instance_id, 1)
        record_success_month(LAST_SUCCESS_MONTH, datetime.now(timezone.utc))
        print(f"restore_status=ok migrations={migrations}")
        return 0
    except (RestoreCheckError, OSError, subprocess.SubprocessError) as error:
        if instance_id:
            try:
                publish_metric(instance_id, 0)
            except (OSError, subprocess.SubprocessError):
                pass
        print(f"restore_status=failed reason={error}", file=sys.stderr)
        return 1
    finally:
        if dump is not None:
            dump.unlink(missing_ok=True)


def cli_main(arguments: list[str]) -> int:
    """Select the isolated restore or its lightweight freshness heartbeat."""

    if arguments == ["--freshness"]:
        return freshness_main()
    if not arguments:
        return main()
    print("usage: staging_db_restore_check.py [--freshness]", file=sys.stderr)
    return 2


if __name__ == "__main__":
    raise SystemExit(cli_main(sys.argv[1:]))
