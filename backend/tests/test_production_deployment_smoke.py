"""Contract tests for the executable production-like deployment smoke."""

import pytest

from config.settings.production_environment import (
    REQUIRED_ENVIRONMENT_VARIABLES,
)
from scripts.smoke_production_deployment import deploy_smoke_stack


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
