"""Contract tests for migration-first backend deployment orchestration.

Scenario list:

- run one migration container before promoting the API container
- stop before API promotion when migration fails
- use one inherited Step 7 environment snapshot for both Docker commands
- wait for the promoted API container to become healthy
- return a controlled failure status from the deployment CLI
"""

import subprocess

import pytest

from scripts.production_deployment import deploy_backend


def test_migration_runs_before_api_promotion(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    commands: list[list[str]] = []

    def fake_run(
        command: list[str],
        *,
        check: bool,
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
