"""Contract tests for the executable production-like deployment smoke."""

import subprocess

import pytest

from config.settings.production_environment import (
    REQUIRED_ENVIRONMENT_VARIABLES,
)
from scripts.smoke_production_deployment import deploy_smoke_stack, main, run_smoke


def test_smoke_deployment_uses_step7_environment_injection(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    invocations: list[tuple[list[str], dict[str, str]]] = []

    def fake_run_deployment_command(
        command: list[str],
        runtime_environment: dict[str, str],
    ) -> None:
        invocations.append((command, runtime_environment))

    monkeypatch.setattr(
        "scripts.smoke_production_deployment.run_deployment_command",
        fake_run_deployment_command,
    )

    deploy_smoke_stack()

    assert len(invocations) == 1
    command, runtime_environment = invocations[0]
    assert command[1:] == [
        "-m",
        "scripts.production_deployment",
        "--compose-file",
        "docker-compose.production-smoke.yml",
        "--project-name",
        "longevity-production-smoke",
    ]
    assert set(runtime_environment) == set(REQUIRED_ENVIRONMENT_VARIABLES)
    assert all(value not in command for value in runtime_environment.values())


def test_smoke_cleanup_is_attempted_when_deployment_fails(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    invocations: list[tuple[list[str], dict[str, str]]] = []

    def fake_run_deployment_command(
        command: list[str],
        runtime_environment: dict[str, str],
    ) -> None:
        invocations.append((command, runtime_environment))
        if len(invocations) == 1:
            raise subprocess.CalledProcessError(returncode=17, cmd=command)

    monkeypatch.setattr(
        "scripts.smoke_production_deployment.run_deployment_command",
        fake_run_deployment_command,
    )

    with pytest.raises(subprocess.CalledProcessError) as error:
        run_smoke()

    assert error.value.returncode == 17
    assert len(invocations) == 2
    cleanup_command, _ = invocations[1]
    assert cleanup_command == [
        "docker",
        "compose",
        "--project-name",
        "longevity-production-smoke",
        "--env-file",
        "/dev/null",
        "--file",
        "docker-compose.production-smoke.yml",
        "down",
        "--volumes",
        "--remove-orphans",
    ]


def test_smoke_cli_runs_the_complete_lifecycle(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    lifecycle_calls = 0

    def fake_run_smoke() -> None:
        nonlocal lifecycle_calls
        lifecycle_calls += 1

    monkeypatch.setattr(
        "scripts.smoke_production_deployment.run_smoke",
        fake_run_smoke,
    )

    assert main() == 0
    assert lifecycle_calls == 1


def test_smoke_cli_reports_subprocess_failure_without_traceback(
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    def fake_run_smoke() -> None:
        raise subprocess.CalledProcessError(returncode=17, cmd=["docker"])

    monkeypatch.setattr(
        "scripts.smoke_production_deployment.run_smoke",
        fake_run_smoke,
    )

    assert main() == 17
    assert capsys.readouterr().err == (
        "error: production smoke failed with exit code 17\n"
    )


def test_smoke_cli_reports_command_start_failure_without_traceback(
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    def fake_run_smoke() -> None:
        raise OSError("docker executable is unavailable")

    monkeypatch.setattr(
        "scripts.smoke_production_deployment.run_smoke",
        fake_run_smoke,
    )

    assert main() == 1
    assert capsys.readouterr().err == (
        "error: unable to start production smoke command\n"
    )
