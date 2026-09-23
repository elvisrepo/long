"""Regression scenarios for the staging deployment review.

Scenarios: dependency-free host loader; production migrations; exact database
destination; digest-qualified image; EBS mount/boot guard; bounded logs; health
checks with a permitted Host. No test contacts AWS or starts staging containers.
"""

import json
import os
from pathlib import Path
import subprocess
import sys
from typing import Any
from unittest.mock import MagicMock, patch

import pytest

from scripts import staging_runtime


BACKEND = Path(__file__).resolve().parents[1]


def compose_model(filename: str) -> dict[str, Any]:
    """Resolve the real Compose model with inert, isolated environment values."""
    environment = {key: "dummy" for key in staging_runtime.REQUIRED_RUNTIME_KEYS}
    environment.update(
        {
            "PATH": os.environ["PATH"],
            "BACKEND_IMAGE": "example.invalid/backend@sha256:" + "a" * 64,
            "ALLOWED_HOSTS": "staging.syncvitals.space",
        }
    )
    result = subprocess.run(
        [
            "docker",
            "compose",
            "--env-file",
            "/dev/null",
            "-f",
            str(BACKEND / filename),
            "config",
            "--no-normalize",
            "--format",
            "json",
        ],
        env=environment,
        check=True,
        capture_output=True,
        text=True,
    )
    return json.loads(result.stdout)


def test_host_loader_help_needs_no_application_dependencies() -> None:
    environment = {"PATH": os.environ["PATH"], "PYTHONPATH": str(BACKEND)}
    result = subprocess.run(
        [sys.executable, "-S", "-m", "scripts.staging_runtime", "--help"],
        cwd=BACKEND,
        env=environment,
        capture_output=True,
        text=True,
    )

    assert result.returncode == 0, result.stderr
    assert "--secret-id" in result.stdout


@pytest.mark.parametrize(
    "database_url",
    [
        "postgresql://longevity:dummy@wrong-host:5432/longevity",
        "postgresql://wrong-user:dummy@database:5432/longevity",
        "postgresql://longevity:dummy@database:5432/wrong-db",
        "postgresql://longevity:dummy@database:5433/longevity",
        "postgresql://longevity:dummy@database:0/longevity",
        "mysql://longevity:dummy@database:5432/longevity",
        "postgresql://longevity:dummy@database:5432/longevity?host=other",
        "postgresql://longevity:dummy@database:5432/longevity#ignored",
        "postgresql://longevity:dummy@database:invalid/longevity",
    ],
)
def test_loader_rejects_wrong_database_before_deployment(
    monkeypatch: pytest.MonkeyPatch,
    database_url: str,
) -> None:
    payload = {key: "dummy" for key in staging_runtime.REQUIRED_RUNTIME_KEYS}
    payload["DATABASE_URL"] = database_url
    monkeypatch.setattr(
        staging_runtime,
        "retrieve_secret_string",
        lambda *args, **kwargs: json.dumps(payload),
    )

    with pytest.raises(staging_runtime.StagingRuntimeConfigurationError) as error:
        staging_runtime.load_runtime_environment("unused", region="eu-central-1")
    assert "staging PostgreSQL destination" in str(error.value)
    assert database_url not in str(error.value)


@pytest.mark.parametrize(
    "filename",
    [
        "docker-compose.staging.yml",
        "docker-compose.production-smoke.yml",
    ],
)
def test_migrations_and_api_explicitly_select_production_settings(
    filename: str,
) -> None:
    services = compose_model(filename)["services"]
    for name in ("migration", "api"):
        assert services[name]["environment"].get("DJANGO_SETTINGS_MODULE") == (
            "config.settings.prod"
        )


@pytest.mark.parametrize(
    "filename",
    [
        "docker-compose.staging.yml",
        "docker-compose.production-smoke.yml",
    ],
)
def test_health_probe_uses_allowed_host_without_allowing_loopback(
    filename: str,
) -> None:
    from django.test import RequestFactory, override_settings

    api = compose_model(filename)["services"]["api"]
    probe = api["healthcheck"]["test"][-1]
    with patch.dict(os.environ, api["environment"], clear=True):
        with patch("urllib.request.urlopen", return_value=MagicMock()) as urlopen:
            exec(probe, {})
    request = urlopen.call_args.args[0]
    assert request.full_url == "http://127.0.0.1:8000/api/v1/health/ready/"
    assert request.get_header("X-forwarded-proto") == "https"
    # Emulate the Host urllib would send, then run Django's actual validation.
    with override_settings(ALLOWED_HOSTS=["staging.syncvitals.space"]):
        incoming = RequestFactory().get(
            "/api/v1/health/ready/",
            HTTP_HOST=request.get_header("Host") or request.host,
        )
        assert incoming.get_host() == "staging.syncvitals.space"


def test_staging_containers_have_bounded_log_storage() -> None:
    services = compose_model("docker-compose.staging.yml")["services"]
    for service in services.values():
        logging = service.get("logging", {})
        assert logging.get("driver") == "local"
        assert logging.get("options") == {"max-size": "10m", "max-file": "3"}


def test_database_mount_never_creates_a_missing_host_directory() -> None:
    database = compose_model("docker-compose.staging.yml")["services"]["database"]
    assert database["volumes"][0].get("bind", {}).get("create_host_path") is False


@pytest.mark.parametrize(
    "image",
    [
        "",
        "backend:latest",
        "173291122778.dkr.ecr.eu-central-1.amazonaws.com/syncvitals/staging/backend:latest",
        "example.invalid/backend@sha256:" + "a" * 64,
        "173291122778.dkr.ecr.eu-central-1.amazonaws.com/syncvitals/staging/backend@sha256:abc",
    ],
)
def test_loader_rejects_unpinned_or_wrong_image_before_fetching_secrets(
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
    image: str,
) -> None:
    monkeypatch.setenv("BACKEND_IMAGE", image)
    with patch.object(staging_runtime, "load_runtime_environment") as load:
        with patch.object(staging_runtime, "run_deployment_command") as deploy:
            status = staging_runtime.main(
                [
                    "--secret-id",
                    "unused",
                    "--region",
                    "eu-central-1",
                    "--",
                    "unused-command",
                ]
            )
    assert status == 1
    load.assert_not_called()
    deploy.assert_not_called()
    assert "BACKEND_IMAGE" in capsys.readouterr().err


def test_loader_checks_storage_before_fetching_secrets(
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    from scripts import staging_storage

    monkeypatch.setenv(
        "BACKEND_IMAGE",
        staging_runtime.STAGING_BACKEND_REPOSITORY + "@sha256:" + "a" * 64,
    )
    # Patch the storage boundary, not the loader: prove the real CLI calls it.
    with patch.object(
        staging_storage,
        "verify_database_storage",
        side_effect=staging_storage.StagingStorageError(
            "expected EBS mount unavailable"
        ),
    ):
        with patch.object(staging_runtime, "load_runtime_environment") as load:
            with patch.object(staging_runtime, "run_deployment_command") as deploy:
                status = staging_runtime.main(
                    [
                        "--secret-id",
                        "unused",
                        "--region",
                        "eu-central-1",
                        "--",
                        "unused-command",
                    ]
                )
    assert status == 1
    load.assert_not_called()
    deploy.assert_not_called()
    assert "expected EBS" in capsys.readouterr().err
