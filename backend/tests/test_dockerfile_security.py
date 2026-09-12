"""Security contracts for the deployable container image."""

from pathlib import Path


BACKEND_DIR = Path(__file__).resolve().parents[1]


def test_production_image_installs_available_os_security_updates() -> None:
    dockerfile = (BACKEND_DIR / "Dockerfile").read_text()
    production_stage = dockerfile.split("FROM python:3.14-slim-trixie AS production", 1)[1]

    assert (
        "apt-get update && apt-get upgrade -y --no-install-recommends"
        in production_stage
    )
    assert "rm -rf /var/lib/apt/lists/*" in production_stage
