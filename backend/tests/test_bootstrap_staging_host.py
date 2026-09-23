from __future__ import annotations

import os
from pathlib import Path
import subprocess


SCRIPT = Path(__file__).parents[1] / "scripts" / "bootstrap_staging_host.sh"


def write_executable(path: Path, content: str) -> None:
    path.write_text(content, encoding="utf-8")
    path.chmod(0o755)


def test_preflight_reports_supported_host(tmp_path: Path) -> None:
    os_release = tmp_path / "os-release"
    os_release.write_text('ID=ubuntu\nVERSION_ID="24.04"\n', encoding="utf-8")

    environment = os.environ.copy()
    environment.update(
        {
            "SYNCVITALS_BOOTSTRAP_ARCHITECTURE": "aarch64",
            "SYNCVITALS_BOOTSTRAP_EFFECTIVE_UID": "0",
            "SYNCVITALS_BOOTSTRAP_OS_RELEASE": str(os_release),
        }
    )

    result = subprocess.run(
        ["bash", str(SCRIPT), "preflight"],
        capture_output=True,
        check=False,
        env=environment,
        text=True,
    )

    assert result.returncode == 0, result.stderr
    assert "preflight_status=ok" in result.stdout
    assert "os=ubuntu-24.04" in result.stdout
    assert "architecture=aarch64" in result.stdout


def test_configure_docker_repository_writes_official_apt_source(
    tmp_path: Path,
) -> None:
    fake_bin = tmp_path / "bin"
    fake_bin.mkdir()
    command_log = tmp_path / "commands.log"
    root = tmp_path / "root"
    os_release = tmp_path / "os-release"
    os_release.write_text(
        'ID=ubuntu\nVERSION_ID="24.04"\nVERSION_CODENAME=noble\n',
        encoding="utf-8",
    )

    write_executable(
        fake_bin / "apt-get",
        "#!/bin/sh\nprintf 'apt-get %s\\n' \"$*\" >> \"$COMMAND_LOG\"\n",
    )
    write_executable(
        fake_bin / "curl",
        """#!/bin/sh
while [ "$#" -gt 0 ]; do
    if [ "$1" = "-o" ]; then
        printf 'FAKE DOCKER KEY\n' > "$2"
        exit 0
    fi
    shift
done
exit 1
""",
    )
    write_executable(
        fake_bin / "dpkg",
        "#!/bin/sh\n[ \"$1\" = \"--print-architecture\" ] && printf 'arm64\\n'\n",
    )
    write_executable(fake_bin / "dpkg-query", "#!/bin/sh\nexit 1\n")
    write_executable(
        fake_bin / "apt-cache",
        "#!/bin/sh\nprintf '  Candidate: 5:29.8.0-1~ubuntu.24.04~noble\\n'\n",
    )

    environment = os.environ.copy()
    environment.update(
        {
            "COMMAND_LOG": str(command_log),
            "PATH": f"{fake_bin}:{environment['PATH']}",
            "SYNCVITALS_BOOTSTRAP_ARCHITECTURE": "aarch64",
            "SYNCVITALS_BOOTSTRAP_EFFECTIVE_UID": "0",
            "SYNCVITALS_BOOTSTRAP_OS_RELEASE": str(os_release),
            "SYNCVITALS_BOOTSTRAP_ROOT": str(root),
        }
    )

    result = subprocess.run(
        ["bash", str(SCRIPT), "configure-docker-repository"],
        capture_output=True,
        check=False,
        env=environment,
        text=True,
    )

    assert result.returncode == 0, result.stderr
    assert "docker_repository_status=configured" in result.stdout
    assert "docker_candidate=5:29.8.0-1~ubuntu.24.04~noble" in result.stdout
    assert (root / "etc/apt/keyrings/docker.asc").read_text(encoding="utf-8") == (
        "FAKE DOCKER KEY\n"
    )
    assert (root / "etc/apt/sources.list.d/docker.sources").read_text(
        encoding="utf-8"
    ) == (
        "Types: deb\n"
        "URIs: https://download.docker.com/linux/ubuntu\n"
        "Suites: noble\n"
        "Components: stable\n"
        "Architectures: arm64\n"
        "Signed-By: /etc/apt/keyrings/docker.asc\n"
    )
    assert command_log.read_text(encoding="utf-8").splitlines() == [
        "apt-get update",
        "apt-get install -y ca-certificates curl",
        "apt-get update",
    ]


def test_install_docker_engine_pins_candidate_and_verifies_runtime(
    tmp_path: Path,
) -> None:
    fake_bin = tmp_path / "bin"
    fake_bin.mkdir()
    command_log = tmp_path / "commands.log"
    root = tmp_path / "root"
    (root / "etc/apt/keyrings").mkdir(parents=True)
    (root / "etc/apt/sources.list.d").mkdir(parents=True)
    (root / "etc/apt/keyrings/docker.asc").write_text("key\n", encoding="utf-8")
    (root / "etc/apt/sources.list.d/docker.sources").write_text(
        "Types: deb\n",
        encoding="utf-8",
    )
    os_release = tmp_path / "os-release"
    os_release.write_text('ID=ubuntu\nVERSION_ID="24.04"\n', encoding="utf-8")

    write_executable(
        fake_bin / "apt-cache",
        "#!/bin/sh\nprintf '  Candidate: 5:29.8.0-1~ubuntu.24.04~noble\\n'\n",
    )
    write_executable(
        fake_bin / "apt-get",
        "#!/bin/sh\nprintf 'apt-get %s\\n' \"$*\" >> \"$COMMAND_LOG\"\n",
    )
    write_executable(
        fake_bin / "systemctl",
        "#!/bin/sh\nprintf 'systemctl %s\\n' \"$*\" >> \"$COMMAND_LOG\"\n",
    )
    write_executable(
        fake_bin / "docker",
        """#!/bin/sh
printf 'docker %s\n' "$*" >> "$COMMAND_LOG"
case "$*" in
    "version --format {{.Server.Version}}") printf '29.8.0\n' ;;
    "compose version --short") printf '5.0.1\n' ;;
esac
""",
    )

    environment = os.environ.copy()
    environment.update(
        {
            "COMMAND_LOG": str(command_log),
            "PATH": f"{fake_bin}:{environment['PATH']}",
            "SYNCVITALS_BOOTSTRAP_ARCHITECTURE": "aarch64",
            "SYNCVITALS_BOOTSTRAP_EFFECTIVE_UID": "0",
            "SYNCVITALS_BOOTSTRAP_OS_RELEASE": str(os_release),
            "SYNCVITALS_BOOTSTRAP_ROOT": str(root),
        }
    )

    result = subprocess.run(
        ["bash", str(SCRIPT), "install-docker-engine"],
        capture_output=True,
        check=False,
        env=environment,
        text=True,
    )

    assert result.returncode == 0, result.stderr
    assert "docker_engine_status=installed" in result.stdout
    assert "docker_engine_version=29.8.0" in result.stdout
    assert "docker_compose_version=5.0.1" in result.stdout
    assert command_log.read_text(encoding="utf-8").splitlines() == [
        "apt-get install -y docker-ce=5:29.8.0-1~ubuntu.24.04~noble "
        "docker-ce-cli=5:29.8.0-1~ubuntu.24.04~noble containerd.io "
        "docker-buildx-plugin docker-compose-plugin",
        "systemctl enable --now docker",
        "systemctl is-active --quiet docker",
        "systemctl is-enabled --quiet docker",
        "docker version --format {{.Server.Version}}",
        "docker compose version --short",
        "docker run --rm hello-world",
    ]
