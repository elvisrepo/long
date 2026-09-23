"""Fail-closed database storage checks, without mounting or formatting disks."""

import json
import configparser
import os
from pathlib import Path
import subprocess
import shutil

import pytest


def test_storage_guard_rejects_directory_backed_by_root_disk(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from scripts import staging_storage

    mount = tmp_path / "syncvitals"
    data = mount / "postgresql"
    data.mkdir(parents=True)
    monkeypatch.setattr(staging_storage, "DATA_MOUNT", mount)
    monkeypatch.setattr(staging_storage, "DATA_DIRECTORY", data)
    response = {
        "filesystems": [
            {
                "target": "/",
                "uuid": "root-disk-uuid",
                "fstype": "ext4",
                "options": "rw",
            }
        ]
    }
    monkeypatch.setattr(
        staging_storage.subprocess,
        "run",
        lambda *args, **kwargs: subprocess.CompletedProcess(
            args[0],
            0,
            stdout=json.dumps(response),
            stderr="",
        ),
    )

    with pytest.raises(staging_storage.StagingStorageError, match="expected EBS"):
        staging_storage.verify_database_storage()


def test_docker_boot_requires_mount_and_runs_the_storage_guard() -> None:
    source = (
        Path(__file__).resolve().parents[1]
        / "deploy/docker.service.d/10-staging-storage.conf"
    )
    unit = configparser.ConfigParser(interpolation=None)
    assert unit.read(source), "Docker boot guard is missing"
    assert unit["Unit"]["RequiresMountsFor"] == "/srv/syncvitals"
    assert "srv-syncvitals.mount" in unit["Unit"]["BindsTo"].split()
    assert "srv-syncvitals.mount" in unit["Unit"]["After"].split()
    assert unit["Service"]["ExecStartPre"] == (
        "/usr/bin/python3 /opt/syncvitals/deployment/scripts/staging_storage.py"
    )


@pytest.mark.parametrize(
    "case",
    [
        "valid",
        "wrong_uuid",
        "readonly",
        "wrong_fstype",
        "nested_mount",
        "missing",
        "symlink",
        "malformed",
        "null_options",
        "command_failed",
        "timeout",
    ],
)
def test_storage_guard_accepts_only_expected_writable_volume(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    case: str,
    capsys: pytest.CaptureFixture[str],
) -> None:
    from scripts import staging_storage

    mount = tmp_path / "syncvitals"
    data = mount / "postgresql"
    mount.mkdir()
    if case == "symlink":
        other = tmp_path / "other-disk"
        other.mkdir()
        data.symlink_to(other, target_is_directory=True)
    elif case != "missing":
        data.mkdir()
    monkeypatch.setattr(staging_storage, "DATA_MOUNT", mount)
    monkeypatch.setattr(staging_storage, "DATA_DIRECTORY", data)
    filesystem = {
        "target": str(mount),
        "uuid": staging_storage.EXPECTED_UUID,
        "fstype": "ext4",
        "options": "rw,relatime",
    }
    if case == "wrong_uuid":
        filesystem["uuid"] = "unrelated-volume"
    elif case == "readonly":
        filesystem["options"] = "ro,relatime"
    elif case == "wrong_fstype":
        filesystem["fstype"] = "tmpfs"
    elif case == "nested_mount":
        filesystem["target"] = str(data)

    def fake_run(
        command: list[str], **kwargs: object
    ) -> subprocess.CompletedProcess[str]:
        assert command[command.index("--target") + 1] == str(data)
        if case == "command_failed":
            raise subprocess.CalledProcessError(1, command)
        if case == "timeout":
            raise subprocess.TimeoutExpired(command, 10)
        output = json.dumps({"filesystems": [filesystem]})
        if case == "malformed":
            output = "not-json"
        if case == "null_options":
            output = output.replace('"rw,relatime"', "null")
        return subprocess.CompletedProcess(command, 0, stdout=output, stderr="")

    monkeypatch.setattr(staging_storage.subprocess, "run", fake_run)
    assert staging_storage.main() == (0 if case == "valid" else 1)
    captured = capsys.readouterr()
    assert captured.out == ""
    assert "Traceback" not in captured.err


@pytest.mark.skipif(
    shutil.which("systemd-analyze") is None, reason="systemd tools unavailable"
)
def test_boot_override_passes_systemd_unit_validation(tmp_path: Path) -> None:
    """Parse dependencies and ordering without installing or starting a unit."""
    backend = Path(__file__).resolve().parents[1]
    dropin = tmp_path / "docker.service.d"
    dropin.mkdir()
    shutil.copyfile(
        backend / "deploy/docker.service.d/10-staging-storage.conf",
        dropin / "10-staging-storage.conf",
    )
    service = tmp_path / "docker.service"
    service.write_text("[Service]\nType=simple\nExecStart=/usr/bin/true\n")
    mount = tmp_path / "srv-syncvitals.mount"
    mount.write_text("[Mount]\nWhat=/dev/null\nWhere=/srv/syncvitals\nType=ext4\n")
    result = subprocess.run(
        ["systemd-analyze", "verify", "--man=no", str(service), str(mount)],
        env={**os.environ, "SYSTEMD_UNIT_PATH": f"{tmp_path}:"},
        capture_output=True,
        text=True,
    )
    assert result.returncode == 0, result.stderr
