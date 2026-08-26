"""Compose the local production-like deployment smoke command.

The smoke uses inert local values, but sends them through the same Step 7
validation and in-memory injection boundary used by staging deployments.
"""

import json
import subprocess
import sys
from collections.abc import Mapping
from urllib import request

from scripts.staging_runtime import parse_runtime_secret, run_deployment_command


COMPOSE_FILE = "docker-compose.production-smoke.yml"
PROJECT_NAME = "longevity-production-smoke"
SMOKE_API_ORIGIN = "http://127.0.0.1:18000"

# These values are deliberately non-production and exist only for the
# disposable local smoke stack. Keeping the full snapshot here makes contract
# drift visible when Step 7 adds or removes a required production key.
INERT_RUNTIME_SECRET = {
    "SECRET_KEY": "production-smoke-secret-key-not-for-real-environments",
    "PII_ENCRYPTION_KEY": "8xSPkbwoMvV7Y4NNyG8_N0-LLf9a8q0lVq2dNfXl4zQ=",
    "EMAIL_LOOKUP_KEY": "production-smoke-email-lookup-key",
    "JWT_SIGNING_KEY": "production-smoke-jwt-signing-key-not-for-real-environments",
    "DATABASE_URL": (
        "postgresql://postgres:postgres-smoke@database:5432/longevity_smoke"
    ),
    "ALLOWED_HOSTS": "127.0.0.1,localhost",
    "CSRF_TRUSTED_ORIGINS": "https://staging.example.com",
    "STRIPE_SECRET_KEY": "sk_test_production_smoke",
    "STRIPE_WEBHOOK_SECRET": "whsec_production_smoke",
    "STRIPE_CHECKOUT_SUCCESS_URL": "https://staging.example.com/billing/success",
    "STRIPE_CHECKOUT_CANCEL_URL": "https://staging.example.com/billing/cancel",
    "STRIPE_CUSTOMER_PORTAL_RETURN_URL": "https://staging.example.com/billing",
    "LOG_LEVEL": "INFO",
    "DJANGO_LOG_LEVEL": "INFO",
}


class SmokeVerificationError(RuntimeError):
    """Report an unexpected smoke response without exposing its content."""


def verify_smoke_liveness() -> None:
    """Verify Gunicorn serves the public liveness contract through loopback."""

    health_request = request.Request(
        f"{SMOKE_API_ORIGIN}/api/v1/health/live/",
        headers={"X-Forwarded-Proto": "https"},
    )
    with request.urlopen(health_request, timeout=5.0) as response:
        status = response.status
        payload = json.loads(response.read())

    if status != 200 or payload != {"status": "ok"}:
        raise SmokeVerificationError("production smoke liveness check failed")


def deploy_smoke_stack(
    runtime_environment: Mapping[str, str] | None = None,
) -> None:
    """Validate one inert snapshot and inject it into Step 8 orchestration."""

    if runtime_environment is None:
        runtime_environment = parse_runtime_secret(json.dumps(INERT_RUNTIME_SECRET))
    command = [
        sys.executable,
        "-m",
        "scripts.production_deployment",
        "--compose-file",
        COMPOSE_FILE,
        "--project-name",
        PROJECT_NAME,
    ]
    run_deployment_command(command, runtime_environment)


def cleanup_smoke_stack(runtime_environment: Mapping[str, str]) -> None:
    """Remove every resource owned by the disposable smoke project."""

    command = [
        "docker",
        "compose",
        "--project-name",
        PROJECT_NAME,
        "--env-file",
        "/dev/null",
        "--file",
        COMPOSE_FILE,
        "down",
        "--volumes",
        "--remove-orphans",
    ]
    run_deployment_command(command, runtime_environment)


def run_smoke() -> None:
    """Deploy the disposable stack and always attempt to clean it up."""

    runtime_environment = parse_runtime_secret(json.dumps(INERT_RUNTIME_SECRET))
    try:
        deploy_smoke_stack(runtime_environment)
        verify_smoke_liveness()
    finally:
        cleanup_smoke_stack(runtime_environment)


def main() -> int:
    """Run one complete production-like smoke lifecycle."""

    try:
        run_smoke()
    except subprocess.CalledProcessError as error:
        exit_code = error.returncode if 1 <= error.returncode <= 255 else 1
        print(
            f"error: production smoke failed with exit code {exit_code}",
            file=sys.stderr,
        )
        return exit_code
    except OSError:
        print(
            "error: unable to start production smoke command",
            file=sys.stderr,
        )
        return 1

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
