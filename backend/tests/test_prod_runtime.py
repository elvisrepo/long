"""Production application-server runtime contract tests."""

import json
import os
from pathlib import Path


BACKEND_DIR = Path(__file__).resolve().parents[1]


def dockerfile_default_command() -> list[str]:
    """Return the Dockerfile's JSON-form default command.

    Parsing the exec-form JSON keeps assertions focused on command arguments
    instead of whitespace or shell quoting in the Dockerfile.
    """

    dockerfile = (BACKEND_DIR / "Dockerfile").read_text()
    # Docker permits indentation before instructions, so normalize each line
    # before selecting the single default command.
    instructions = (line.strip() for line in dockerfile.splitlines())
    command_line = next(
        line.removeprefix("CMD ")
        for line in instructions
        if line.startswith("CMD ")
    )
    command = json.loads(command_line)
    assert isinstance(command, list)
    return command


def test_image_defaults_to_gunicorn_with_production_settings() -> None:
    # The immutable image must be safe by default; production should not depend
    # on deployment orchestration remembering to replace `runserver`.
    command = dockerfile_default_command()

    assert command[0] == "gunicorn"
    assert "config.wsgi:application" in command
    assert "DJANGO_SETTINGS_MODULE=config.settings.prod" in command


def test_gunicorn_has_explicit_operational_defaults() -> None:
    # Lock the small-instance staging choices and container logging contract so
    # they cannot disappear silently during Dockerfile refactoring.
    command = dockerfile_default_command()

    assert "--bind=0.0.0.0:8000" in command
    assert "--workers=2" in command
    assert "--timeout=30" in command
    assert "--graceful-timeout=30" in command
    assert "--access-logfile=-" in command
    assert "--error-logfile=-" in command


def test_local_compose_overrides_image_with_development_server() -> None:
    compose = (BACKEND_DIR / "docker-compose.yml").read_text()

    # Both normal development and browser E2E need Django's auto-reloading
    # server. Gunicorn belongs to the image default, not either Compose command.
    development_command = "python manage.py runserver 0.0.0.0:8000"
    assert compose.count(development_command) == 2
    assert "gunicorn" not in compose


def test_production_image_smoke_builds_and_checks_wsgi_app() -> None:
    smoke_script_path = BACKEND_DIR / "scripts/smoke_prod_image.sh"
    smoke_script = smoke_script_path.read_text()

    # Ordinary pytest remains Docker-daemon independent. It protects the smoke
    # harness contract; backend CI executes the script against the real image.
    assert os.access(smoke_script_path, os.X_OK)
    assert "docker build" in smoke_script
    assert "--check-config" in smoke_script
    assert "DJANGO_SETTINGS_MODULE=config.settings.prod" in smoke_script
    assert "config.wsgi:application" in smoke_script
