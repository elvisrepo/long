"""Tests for the isolated staging PostgreSQL restore check."""

from __future__ import annotations

import configparser
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import shutil
import subprocess

import pytest


def test_select_latest_backup_uses_last_modified_not_listing_order() -> None:
    from scripts.staging_db_restore_check import select_latest_backup

    listing = json.dumps(
        {
            "Contents": [
                {
                    "Key": "postgresql/year=2026/month=09/older.dump",
                    "LastModified": "2026-09-15T10:00:00+00:00",
                },
                {
                    "Key": "postgresql/year=2026/month=09/newest.dump",
                    "LastModified": "2026-09-15T12:00:00+00:00",
                },
                {
                    "Key": "postgresql/year=2026/month=09/middle.dump",
                    "LastModified": "2026-09-15T11:00:00+00:00",
                },
            ]
        }
    )

    assert select_latest_backup(listing) == (
        "postgresql/year=2026/month=09/newest.dump"
    )


@pytest.mark.parametrize("listing", ["{}", '{"Contents": []}', "not-json"])
def test_select_latest_backup_rejects_missing_or_invalid_objects(listing: str) -> None:
    from scripts.staging_db_restore_check import RestoreCheckError
    from scripts.staging_db_restore_check import select_latest_backup

    with pytest.raises(RestoreCheckError, match="backup listing"):
        select_latest_backup(listing)


def test_verify_checksum_accepts_the_s3_sha256_metadata(tmp_path: Path) -> None:
    from scripts.staging_db_restore_check import verify_checksum

    dump = tmp_path / "backup.dump"
    dump.write_bytes(b"abc")

    assert verify_checksum(
        dump,
        json.dumps(
            {
                "Metadata": {
                    "sha256": (
                        "ba7816bf8f01cfea414140de5dae2223"
                        "b00361a396177a9cb410ff61f20015ad"
                    )
                }
            }
        ),
    ) == "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"


def test_verify_checksum_rejects_a_modified_download(tmp_path: Path) -> None:
    from scripts.staging_db_restore_check import RestoreCheckError
    from scripts.staging_db_restore_check import verify_checksum

    dump = tmp_path / "backup.dump"
    dump.write_bytes(b"modified")
    metadata = json.dumps({"Metadata": {"sha256": "0" * 64}})

    with pytest.raises(RestoreCheckError, match="checksum mismatch"):
        verify_checksum(dump, metadata)


def test_restore_dump_uses_an_isolated_disposable_container(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from scripts import staging_db_restore_check

    dump = tmp_path / "backup.dump"
    dump.write_bytes(b"backup")
    calls: list[tuple[list[str], bool, dict[str, str] | None]] = []

    def fake_run(
        command: list[str],
        *,
        capture_output: bool,
        check: bool,
        env: dict[str, str] | None = None,
        text: bool,
        timeout: int,
    ) -> subprocess.CompletedProcess[str]:
        calls.append((command, check, env))
        stdout = ""
        if "pg_isready" in command:
            stdout = "/var/run/postgresql:5432 - accepting connections\n"
        elif "pg_tables" in command[-1]:
            stdout = f"{len(staging_db_restore_check.REQUIRED_TABLES)}\n"
        elif "django_migrations" in command[-1]:
            stdout = "61\n"
        return subprocess.CompletedProcess(command, 0, stdout=stdout, stderr="")

    monkeypatch.setattr(staging_db_restore_check.subprocess, "run", fake_run)
    monkeypatch.setattr(
        staging_db_restore_check.secrets,
        "token_urlsafe",
        lambda _: "not-logged-password",
    )

    migrations = staging_db_restore_check.restore_dump(dump, "restore-check")

    assert migrations == 61
    commands = [command for command, _, _ in calls]
    run = commands[0]
    assert run[:8] == [
        "docker",
        "run",
        "-d",
        "--rm",
        "--name",
        "restore-check",
        "--network=none",
        "--tmpfs",
    ]
    assert "/var/lib/postgresql/data:rw,nosuid,nodev,size=512m" in run
    assert "-v" not in run
    assert "--volume" not in run
    assert "not-logged-password" not in run
    assert calls[0][2] == {**os.environ, "POSTGRES_PASSWORD": "not-logged-password"}
    assert any(command[:2] == ["docker", "cp"] for command in commands)
    assert any("pg_restore" in command for command in commands)
    assert commands[-1] == ["docker", "rm", "-f", "restore-check"]
    assert calls[-1][1] is False


def test_main_downloads_validates_restores_and_publishes_success(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    from scripts import staging_db_restore_check

    digest = (
        "ba7816bf8f01cfea414140de5dae2223"
        "b00361a396177a9cb410ff61f20015ad"
    )
    calls: list[list[str]] = []

    def fake_run_command(
        command: list[str],
        *,
        check: bool = True,
        environment: dict[str, str] | None = None,
    ) -> subprocess.CompletedProcess[str]:
        del check, environment
        calls.append(command)
        stdout = ""
        if "list-objects-v2" in command:
            stdout = json.dumps(
                {
                    "Contents": [
                        {
                            "Key": "postgresql/year=2026/month=09/latest.dump",
                            "LastModified": "2026-09-15T12:00:00+00:00",
                        }
                    ]
                }
            )
        elif "head-object" in command:
            stdout = json.dumps({"Metadata": {"sha256": digest}})
        elif "get-object" in command:
            Path(command[-1]).write_bytes(b"abc")
        return subprocess.CompletedProcess(command, 0, stdout=stdout, stderr="")

    monkeypatch.setattr(staging_db_restore_check, "run_command", fake_run_command)
    monkeypatch.setattr(
        staging_db_restore_check,
        "read_instance_id",
        lambda: "i-08fbc9f0c53265b63",
    )
    monkeypatch.setattr(staging_db_restore_check, "restore_dump", lambda *_: 61)
    marker = tmp_path / "state" / "last-restore-success-month"
    monkeypatch.setattr(staging_db_restore_check, "LAST_SUCCESS_MONTH", marker)

    assert staging_db_restore_check.main(tmp_path) == 0
    assert marker.read_text(encoding="ascii") == datetime.now(timezone.utc).strftime(
        "%Y-%m\n"
    )
    assert any(
        "StagingDatabaseRestoreSuccess" in command and "--value" in command
        and command[command.index("--value") + 1] == "1"
        for command in calls
    )
    assert "restore_status=ok migrations=61" in capsys.readouterr().out


def test_main_publishes_failure_and_removes_a_bad_download(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    from scripts import staging_db_restore_check

    calls: list[list[str]] = []

    def fake_run_command(
        command: list[str],
        *,
        check: bool = True,
        environment: dict[str, str] | None = None,
    ) -> subprocess.CompletedProcess[str]:
        del check, environment
        calls.append(command)
        return subprocess.CompletedProcess(command, 0, stdout="{}", stderr="")

    monkeypatch.setattr(staging_db_restore_check, "run_command", fake_run_command)
    monkeypatch.setattr(
        staging_db_restore_check,
        "read_instance_id",
        lambda: "i-08fbc9f0c53265b63",
    )
    monkeypatch.setattr(
        staging_db_restore_check,
        "select_latest_backup",
        lambda _: "postgresql/latest.dump",
    )
    monkeypatch.setattr(
        staging_db_restore_check,
        "verify_checksum",
        lambda *_: (_ for _ in ()).throw(
            staging_db_restore_check.RestoreCheckError("backup checksum mismatch")
        ),
    )
    monkeypatch.setattr(
        staging_db_restore_check,
        "restore_dump",
        lambda *_: pytest.fail("a corrupt dump must not be restored"),
    )
    marker = tmp_path / "state" / "last-restore-success-month"
    monkeypatch.setattr(staging_db_restore_check, "LAST_SUCCESS_MONTH", marker)

    assert staging_db_restore_check.main(tmp_path) == 1
    assert not list(tmp_path.iterdir())
    assert not marker.exists()
    assert any(
        "StagingDatabaseRestoreSuccess" in command
        and command[command.index("--value") + 1] == "0"
        for command in calls
    )
    assert "backup checksum mismatch" in capsys.readouterr().err


def test_record_success_month_writes_private_utc_marker(tmp_path: Path) -> None:
    from scripts.staging_db_restore_check import record_success_month

    marker = tmp_path / "state" / "last-restore-success-month"
    record_success_month(marker, datetime(2026, 9, 17, 8, 26, tzinfo=timezone.utc))

    assert marker.read_text(encoding="ascii") == "2026-09\n"
    assert marker.stat().st_mode & 0o777 == 0o600


def test_restore_freshness_allows_previous_month_only_before_first_day_deadline(
    tmp_path: Path,
) -> None:
    from scripts.staging_db_restore_check import restore_freshness_value

    marker = tmp_path / "last-restore-success-month"
    marker.write_text("2026-09\n", encoding="ascii")

    assert restore_freshness_value(
        marker, datetime(2026, 10, 1, 0, 10, tzinfo=timezone.utc)
    ) == 1
    assert restore_freshness_value(
        marker, datetime(2026, 10, 1, 6, 10, tzinfo=timezone.utc)
    ) == 0


@pytest.mark.parametrize(
    ("recorded", "expected"),
    [("2026-09\n", 1), ("2026-08\n", 0), ("2026-10\n", 0), (None, 0)],
)
def test_restore_freshness_requires_current_month(
    tmp_path: Path,
    recorded: str | None,
    expected: int,
) -> None:
    from scripts.staging_db_restore_check import restore_freshness_value

    marker = tmp_path / "last-restore-success-month"
    if recorded is not None:
        marker.write_text(recorded, encoding="ascii")

    assert restore_freshness_value(
        marker, datetime(2026, 9, 17, 12, 10, tzinfo=timezone.utc)
    ) == expected


def test_freshness_main_publishes_zero_for_a_missed_month(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    from scripts import staging_db_restore_check

    marker = tmp_path / "last-restore-success-month"
    marker.write_text("2026-09\n", encoding="ascii")
    calls: list[list[str]] = []

    def fake_run_command(
        command: list[str],
        *,
        check: bool = True,
        environment: dict[str, str] | None = None,
    ) -> subprocess.CompletedProcess[str]:
        del check, environment
        calls.append(command)
        return subprocess.CompletedProcess(command, 0, stdout="", stderr="")

    monkeypatch.setattr(staging_db_restore_check, "run_command", fake_run_command)
    monkeypatch.setattr(
        staging_db_restore_check,
        "read_instance_id",
        lambda: "i-08fbc9f0c53265b63",
    )
    monkeypatch.setattr(staging_db_restore_check, "LAST_SUCCESS_MONTH", marker)

    assert staging_db_restore_check.freshness_main(
        datetime(2026, 10, 1, 12, 10, tzinfo=timezone.utc)
    ) == 0
    assert len(calls) == 1
    assert "StagingDatabaseRestoreFresh" in calls[0]
    assert calls[0][calls[0].index("--value") + 1] == "0"
    assert "restore_freshness=stale" in capsys.readouterr().out


def test_cli_routes_freshness_without_running_a_restore(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from scripts import staging_db_restore_check

    monkeypatch.setattr(
        staging_db_restore_check,
        "main",
        lambda: pytest.fail("freshness mode must not restore a backup"),
    )
    monkeypatch.setattr(staging_db_restore_check, "freshness_main", lambda: 0)

    assert staging_db_restore_check.cli_main(["--freshness"]) == 0


def test_restore_service_and_monthly_timer_have_the_safe_contract() -> None:
    backend = Path(__file__).resolve().parents[1]
    systemd = backend / "deploy" / "systemd"
    service = configparser.ConfigParser(interpolation=None)
    timer = configparser.ConfigParser(interpolation=None)

    assert service.read(systemd / "syncvitals-staging-db-restore-check.service")
    assert timer.read(systemd / "syncvitals-staging-db-restore-check.timer")
    assert service["Unit"]["Requires"] == "docker.service"
    assert "network-online.target" in service["Unit"]["After"].split()
    assert service["Service"]["Type"] == "oneshot"
    assert service["Service"]["ExecStart"] == (
        "/usr/bin/python3 "
        "/opt/syncvitals/deployment/scripts/staging_db_restore_check.py"
    )
    assert service["Service"]["UMask"] == "0077"
    assert timer["Timer"]["OnCalendar"] == "*-*-01 04:15:00 UTC"
    assert timer["Timer"]["RandomizedDelaySec"] == "45m"
    assert timer["Timer"]["Persistent"] == "true"
    assert timer["Install"]["WantedBy"] == "timers.target"


def test_freshness_service_and_timer_run_four_times_daily() -> None:
    backend = Path(__file__).resolve().parents[1]
    systemd = backend / "deploy" / "systemd"
    service = configparser.ConfigParser(interpolation=None)
    timer = configparser.ConfigParser(interpolation=None)

    assert service.read(systemd / "syncvitals-staging-db-restore-freshness.service")
    assert timer.read(systemd / "syncvitals-staging-db-restore-freshness.timer")
    assert service["Service"]["Type"] == "oneshot"
    assert service["Service"]["ExecStart"] == (
        "/usr/bin/python3 "
        "/opt/syncvitals/deployment/scripts/staging_db_restore_check.py "
        "--freshness"
    )
    assert timer["Timer"]["OnCalendar"] == "*-*-* 00,06,12,18:10:00 UTC"
    assert timer["Timer"]["Persistent"] == "true"
    assert timer["Install"]["WantedBy"] == "timers.target"


@pytest.mark.skipif(
    shutil.which("systemd-analyze") is None,
    reason="systemd tools unavailable",
)
def test_restore_service_and_timer_pass_systemd_validation(tmp_path: Path) -> None:
    backend = Path(__file__).resolve().parents[1]
    source = backend / "deploy" / "systemd"
    for filename in (
        "syncvitals-staging-db-restore-check.service",
        "syncvitals-staging-db-restore-check.timer",
        "syncvitals-staging-db-restore-freshness.service",
        "syncvitals-staging-db-restore-freshness.timer",
    ):
        shutil.copyfile(source / filename, tmp_path / filename)
    (tmp_path / "docker.service").write_text(
        "[Service]\nType=simple\nExecStart=/usr/bin/true\n",
        encoding="utf-8",
    )

    result = subprocess.run(
        [
            "systemd-analyze",
            "verify",
            "--man=no",
            str(tmp_path / "syncvitals-staging-db-restore-check.service"),
            str(tmp_path / "syncvitals-staging-db-restore-check.timer"),
            str(tmp_path / "syncvitals-staging-db-restore-freshness.service"),
            str(tmp_path / "syncvitals-staging-db-restore-freshness.timer"),
            str(tmp_path / "docker.service"),
        ],
        env={**os.environ, "SYSTEMD_UNIT_PATH": f"{tmp_path}:"},
        capture_output=True,
        text=True,
    )

    assert result.returncode == 0, result.stderr
