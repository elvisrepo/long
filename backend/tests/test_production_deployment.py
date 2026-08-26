"""Contract tests for migration-first backend deployment orchestration.

Scenario list:

- run one migration container before promoting the API container
- stop before API promotion when migration fails
- use one inherited Step 7 environment snapshot for both Docker commands
- wait for the promoted API container to become healthy
- return a controlled failure status from the deployment CLI
"""

import subprocess
from pathlib import Path

import pytest

from config.settings.production_environment import (
    REQUIRED_ENVIRONMENT_VARIABLES,
)
from scripts.production_deployment import deploy_backend, main


BACKEND_DIR = Path(__file__).resolve().parents[1]
PRODUCTION_COMPOSE_FILE = BACKEND_DIR / "docker-compose.production-smoke.yml"


def test_migration_and_api_share_production_image() -> None:
    compose = PRODUCTION_COMPOSE_FILE.read_text()

    assert "x-backend-image: &backend-image" in compose
    assert "target: production" in compose
    assert compose.count("<<: *backend-image") == 2
    assert (
        'command: ["python", "manage.py", "migrate", "--no-input"]'
        in compose
    )


def test_migration_and_api_share_canonical_runtime_environment() -> None:
    compose = PRODUCTION_COMPOSE_FILE.read_text()

    assert "x-backend-environment: &backend-environment" in compose
    assert compose.count("environment: *backend-environment") == 2
    assert "env_file:" not in compose
    for key in REQUIRED_ENVIRONMENT_VARIABLES:
        required_interpolation = f'  {key}: "${{{key}:?{key} is required}}"'
        assert required_interpolation in compose


def test_migration_and_api_wait_for_disposable_database() -> None:
    compose = PRODUCTION_COMPOSE_FILE.read_text()

    assert "image: timescale/timescaledb:latest-pg16" in compose
    assert "pg_isready -U postgres -d longevity_smoke" in compose
    assert "tmpfs:" in compose
    assert "- /var/lib/postgresql/data" in compose
    assert compose.count("condition: service_healthy") == 2


def test_api_health_check_uses_readiness_with_proxy_metadata() -> None:
    compose = PRODUCTION_COMPOSE_FILE.read_text()

    assert '"127.0.0.1:18000:8000"' in compose
    assert "/api/v1/health/ready/" in compose
    assert '"X-Forwarded-Proto": "https"' in compose
    assert "start_period:" in compose


def test_migration_runs_before_api_promotion(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    commands: list[list[str]] = []

    def fake_run(
        command: list[str],
        *,
        check: bool,
        env: dict[str, str] | None = None,
    ) -> subprocess.CompletedProcess[str]:
        assert check is True
        commands.append(command)
        return subprocess.CompletedProcess(command, returncode=0)

    monkeypatch.setattr("scripts.production_deployment.subprocess.run", fake_run)

    deploy_backend(
        compose_file="docker-compose.production-smoke.yml",
        project_name="longevity-production-smoke",
    )

    compose = [
        "docker",
        "compose",
        "--project-name",
        "longevity-production-smoke",
        "--env-file",
        "/dev/null",
        "--file",
        "docker-compose.production-smoke.yml",
    ]
    assert commands == [
        [*compose, "run", "--rm", "migration"],
        [*compose, "up", "--detach", "--wait", "api"],
    ]


def test_migration_failure_prevents_api_promotion(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    commands: list[list[str]] = []

    def fake_run(
        command: list[str],
        *,
        check: bool,
        env: dict[str, str] | None = None,
    ) -> subprocess.CompletedProcess[str]:
        commands.append(command)
        raise subprocess.CalledProcessError(returncode=1, cmd=command)

    monkeypatch.setattr("scripts.production_deployment.subprocess.run", fake_run)

    with pytest.raises(subprocess.CalledProcessError):
        deploy_backend(
            compose_file="docker-compose.production-smoke.yml",
            project_name="longevity-production-smoke",
        )

    assert len(commands) == 1
    assert commands[0][-3:] == ["run", "--rm", "migration"]


def test_migration_and_api_receive_same_environment_snapshot(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("SECRET_KEY", "one-snapshot")
    environments: list[dict[str, str]] = []

    def fake_run(
        command: list[str],
        *,
        check: bool,
        env: dict[str, str],
    ) -> subprocess.CompletedProcess[str]:
        environments.append(env)
        return subprocess.CompletedProcess(command, returncode=0)

    monkeypatch.setattr("scripts.production_deployment.subprocess.run", fake_run)

    deploy_backend(
        compose_file="docker-compose.production-smoke.yml",
        project_name="longevity-production-smoke",
    )

    assert len(environments) == 2
    assert environments[0] is environments[1]
    assert environments[0]["SECRET_KEY"] == "one-snapshot"


def test_cli_runs_production_deployment_once(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    deployments: list[tuple[str, str]] = []

    def fake_deploy_backend(*, compose_file: str, project_name: str) -> None:
        deployments.append((compose_file, project_name))

    monkeypatch.setattr(
        "scripts.production_deployment.deploy_backend",
        fake_deploy_backend,
    )

    exit_code = main([
        "--compose-file",
        "docker-compose.production-smoke.yml",
        "--project-name",
        "longevity-production-smoke",
    ])

    assert exit_code == 0
    assert deployments == [(
        "docker-compose.production-smoke.yml",
        "longevity-production-smoke",
    )]


def test_cli_preserves_compose_failure_without_traceback(
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    def fake_deploy_backend(*, compose_file: str, project_name: str) -> None:
        raise subprocess.CalledProcessError(
            returncode=23,
            cmd=["docker", "compose"],
        )

    monkeypatch.setattr(
        "scripts.production_deployment.deploy_backend",
        fake_deploy_backend,
    )

    exit_code = main([
        "--compose-file",
        "docker-compose.production-smoke.yml",
        "--project-name",
        "longevity-production-smoke",
    ])

    captured = capsys.readouterr()
    assert exit_code == 23
    assert captured.out == ""
    assert captured.err == "error: production deployment failed with exit code 23\n"
    assert "Traceback" not in captured.err
