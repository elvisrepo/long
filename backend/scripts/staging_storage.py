"""Verify the staging EBS filesystem before deployment and Docker startup.

This file is also executed directly by Docker's systemd ExecStartPre hook.
It needs only Ubuntu's Python standard library and findmnt (util-linux).
"""

import json
from pathlib import Path
import subprocess
import sys


DATA_MOUNT = Path("/srv/syncvitals")
DATA_DIRECTORY = DATA_MOUNT / "postgresql"
EXPECTED_UUID = "f4a12602-0ab0-45ae-a73d-dc6fc8fb00e2"


class StagingStorageError(ValueError):
    """Report that the database storage prerequisite has not been met."""


def verify_database_storage() -> None:
    """Require the prepared directory on the expected writable ext4 mount."""

    try:
        if (
            not DATA_DIRECTORY.is_dir()
            or DATA_DIRECTORY.resolve(strict=True) != DATA_DIRECTORY
            or DATA_MOUNT.resolve(strict=True) != DATA_MOUNT
        ):
            raise StagingStorageError(
                "prepared PostgreSQL directory is missing or redirected"
            )
        result = subprocess.run(
            [
                "/usr/bin/findmnt",
                "--json",
                "--target",
                str(DATA_DIRECTORY),
                "--output",
                "TARGET,FSTYPE,UUID,OPTIONS",
            ],
            check=True,
            capture_output=True,
            text=True,
            timeout=10,
        )
        filesystems = json.loads(result.stdout)["filesystems"]
        if len(filesystems) != 1:
            raise StagingStorageError(
                "database directory is not on the expected EBS mount"
            )
        filesystem = filesystems[0]
        if (
            filesystem["target"] != str(DATA_MOUNT)
            or filesystem["uuid"] != EXPECTED_UUID
            or filesystem["fstype"] != "ext4"
            or not isinstance(filesystem["options"], str)
            or "rw" not in filesystem["options"].split(",")
        ):
            raise StagingStorageError(
                "database directory is not on the expected EBS mount"
            )
    except (
        OSError,
        subprocess.SubprocessError,
        ValueError,
        KeyError,
        TypeError,
    ) as error:
        if isinstance(error, StagingStorageError):
            raise
        raise StagingStorageError("unable to verify the expected EBS mount") from None


def main() -> int:
    try:
        verify_database_storage()
    except StagingStorageError as error:
        print(f"error: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
