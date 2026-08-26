"""Contract tests for the executable production-like deployment smoke."""

import subprocess
from unittest.mock import MagicMock

import pytest

from config.settings.production_environment import (
    REQUIRED_ENVIRONMENT_VARIABLES,
)
from scripts.smoke_production_deployment import (
    deploy_smoke_stack,
    main,
    run_smoke,
    verify_smoke_liveness,
    verify_smoke_readiness,
)


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


def test_smoke_liveness_probe_uses_the_public_proxy_contract(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    response = MagicMock()
    response.__enter__.return_value = response
    response.status = 200
    response.read.return_value = b'{"status": "ok"}'
    requests: list[tuple[object, float]] = []

    def fake_urlopen(request: object, *, timeout: float) -> MagicMock:
        requests.append((request, timeout))
        return response

    monkeypatch.setattr(
        "scripts.smoke_production_deployment.request.urlopen",
        fake_urlopen,
    )

    verify_smoke_liveness()

    assert len(requests) == 1
    health_request, timeout = requests[0]
    assert health_request.full_url == (
        "http://127.0.0.1:18000/api/v1/health/live/"
    )
    assert health_request.get_header("X-forwarded-proto") == "https"
    assert timeout == 5.0
    response.read.assert_called_once_with()


def test_smoke_lifecycle_verifies_health_before_cleanup(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    lifecycle_events: list[str] = []

    def fake_deploy_smoke_stack(runtime_environment: object) -> None:
        lifecycle_events.append("deploy")

    def fake_verify_smoke_liveness() -> None:
        lifecycle_events.append("verify-liveness")

    def fake_verify_smoke_readiness() -> None:
        lifecycle_events.append("verify-readiness")

    def fake_cleanup_smoke_stack(runtime_environment: object) -> None:
        lifecycle_events.append("cleanup")

    monkeypatch.setattr(
        "scripts.smoke_production_deployment.deploy_smoke_stack",
        fake_deploy_smoke_stack,
    )
    monkeypatch.setattr(
        "scripts.smoke_production_deployment.verify_smoke_liveness",
        fake_verify_smoke_liveness,
    )
    monkeypatch.setattr(
        "scripts.smoke_production_deployment.verify_smoke_readiness",
        fake_verify_smoke_readiness,
    )
    monkeypatch.setattr(
        "scripts.smoke_production_deployment.cleanup_smoke_stack",
        fake_cleanup_smoke_stack,
    )

    run_smoke()

    assert lifecycle_events == [
        "deploy",
        "verify-liveness",
        "verify-readiness",
        "cleanup",
    ]


def test_smoke_readiness_probe_uses_the_public_proxy_contract(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    response = MagicMock()
    response.__enter__.return_value = response
    response.status = 200
    response.read.return_value = b'{"status": "ok"}'
    requests: list[tuple[object, float]] = []

    def fake_urlopen(request: object, *, timeout: float) -> MagicMock:
        requests.append((request, timeout))
        return response

    monkeypatch.setattr(
        "scripts.smoke_production_deployment.request.urlopen",
        fake_urlopen,
    )

    verify_smoke_readiness()

    assert len(requests) == 1
    health_request, timeout = requests[0]
    assert health_request.full_url == (
        "http://127.0.0.1:18000/api/v1/health/ready/"
    )
    assert health_request.get_header("X-forwarded-proto") == "https"
    assert timeout == 5.0
    response.read.assert_called_once_with()
