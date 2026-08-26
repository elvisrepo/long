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

from scripts.production_deployment import deploy_backend


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
