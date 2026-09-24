"""Tests for the fixed Systems Manager staging deployment command."""

import shlex

import pytest

from scripts.staging_ssm import deployment_parameters


BACKEND_IMAGE = (
    "173291122778.dkr.ecr.eu-central-1.amazonaws.com/"
    "syncvitals/staging/backend@sha256:" + "a" * 64
)


def test_deployment_command_captures_rollback_and_uses_host_guards() -> None:
    parameters = deployment_parameters(
        backend_image=BACKEND_IMAGE,
        region="eu-central-1",
    )
    assert parameters["executionTimeout"] == ["900"]
    command = parameters["commands"][0]
    outer_command = shlex.split(command)

    assert outer_command[:2] == ["bash", "-c"]
    script = outer_command[2]
    assert "docker inspect --format '{{.Config.Image}}'" in script
    assert "previous_backend_image=" in script
    assert "flock --nonblock 9" in script
    assert "/run/lock/syncvitals-staging-deploy.lock" in script
    assert "rollback_file=/opt/syncvitals/deployment/.previous_backend_image" in script
    assert 'if [[ "$running_backend_image" != "$backend_image" ]]' in script
    assert 'previous_backend_image="$(<"$rollback_file")"' in script
    expected_rollback_guard = (
        '[[ "$previous_backend_image" =~ ^173291122778\\.dkr\\.ecr\\.'
        "eu-central-1\\.amazonaws\\.com/syncvitals/staging/"
        "backend@sha256:[0-9a-f]{64}$ ]]"
    )
    assert expected_rollback_guard in script
    assert "python3 -m scripts.staging_runtime" in script
    assert "python3 -m scripts.production_deployment" in script
    assert "export BACKEND_IMAGE=" in script
    assert "http://127.0.0.1:18000/api/v1/health/live/" in script
    assert "http://127.0.0.1:18000/api/v1/health/ready/" in script
    assert "--header 'Host: staging.syncvitals.space'" in script
    assert "--header 'X-Forwarded-Proto: https'" in script
    assert "trap cleanup_ecr_auth EXIT" in script


def test_deployment_command_rejects_a_tagged_image() -> None:
    with pytest.raises(ValueError, match="immutable staging ECR reference"):
        deployment_parameters(
            backend_image=(
                "173291122778.dkr.ecr.eu-central-1.amazonaws.com/"
                "syncvitals/staging/backend:latest"
            ),
            region="eu-central-1",
        )
