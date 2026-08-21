import json
import os
import subprocess
import sys
from pathlib import Path

import pytest


BACKEND_DIR = Path(__file__).resolve().parents[1]
IMPORT_PROD_SETTINGS = "import config.settings.prod"
IMPORT_PROD_SETTINGS_WITHOUT_DOTENV = """
from unittest.mock import patch

with patch("dotenv.load_dotenv", return_value=False):
    import config.settings.prod
"""
REQUIRED_ENVIRONMENT_VARIABLES = (
    "SECRET_KEY",
    "PII_ENCRYPTION_KEY",
    "EMAIL_LOOKUP_KEY",
    "JWT_SIGNING_KEY",
    "DATABASE_URL",
    "ALLOWED_HOSTS",
    "CSRF_TRUSTED_ORIGINS",
    "STRIPE_SECRET_KEY",
    "STRIPE_WEBHOOK_SECRET",
    "STRIPE_CHECKOUT_SUCCESS_URL",
    "STRIPE_CHECKOUT_CANCEL_URL",
    "STRIPE_CUSTOMER_PORTAL_RETURN_URL",
    "LOG_LEVEL",
    "DJANGO_LOG_LEVEL",
)


def valid_prod_environment() -> dict[str, str]:
    return {
        **os.environ,
        "SECRET_KEY": "test-production-secret-key",
        "PII_ENCRYPTION_KEY": "test-pii-encryption-key",
        "EMAIL_LOOKUP_KEY": "test-email-lookup-key",
        "JWT_SIGNING_KEY": "test-jwt-signing-key",
        "DATABASE_URL": "postgresql://user:password@database:5432/longevity",
        "ALLOWED_HOSTS": "staging.example.com",
        "CSRF_TRUSTED_ORIGINS": "https://staging.example.com",
        "STRIPE_SECRET_KEY": "sk_test_fake",
        "STRIPE_WEBHOOK_SECRET": "whsec_fake",
        "STRIPE_CHECKOUT_SUCCESS_URL": (
            "https://staging.example.com/settings?checkout=success"
        ),
        "STRIPE_CHECKOUT_CANCEL_URL": (
            "https://staging.example.com/settings?checkout=cancelled"
        ),
        "STRIPE_CUSTOMER_PORTAL_RETURN_URL": (
            "https://staging.example.com/settings"
        ),
        "LOG_LEVEL": "INFO",
        "DJANGO_LOG_LEVEL": "INFO",
    }


def import_prod_settings(
    environment: dict[str, str],
    *,
    without_dotenv: bool = False,
) -> subprocess.CompletedProcess[str]:
    command = (
        IMPORT_PROD_SETTINGS_WITHOUT_DOTENV
        if without_dotenv
        else IMPORT_PROD_SETTINGS
    )
    return subprocess.run(
        [sys.executable, "-c", command],
        cwd=BACKEND_DIR,
        env=environment,
        capture_output=True,
        check=False,
        text=True,
    )


def read_prod_setting(
    environment: dict[str, str],
    setting_name: str,
) -> subprocess.CompletedProcess[str]:
    command = (
        "import json; "
        "from config.settings import prod; "
        f"print(json.dumps(prod.{setting_name}))"
    )
    return subprocess.run(
        [sys.executable, "-c", command],
        cwd=BACKEND_DIR,
        env=environment,
        capture_output=True,
        check=False,
        text=True,
    )


def test_prod_settings_reject_a_missing_secret_key() -> None:
    environment = valid_prod_environment()
    environment.pop("SECRET_KEY")

    result = import_prod_settings(environment, without_dotenv=True)

    assert result.returncode != 0
    assert "SECRET_KEY is required in production" in result.stderr


@pytest.mark.parametrize("variable_name", REQUIRED_ENVIRONMENT_VARIABLES)
def test_prod_settings_reject_an_empty_required_variable(
    variable_name: str,
) -> None:
    environment = valid_prod_environment()
    environment[variable_name] = ""

    result = import_prod_settings(environment)

    assert result.returncode != 0
    assert f"{variable_name} is required in production" in result.stderr


def test_prod_settings_load_with_complete_environment() -> None:
    result = import_prod_settings(valid_prod_environment())

    assert result.returncode == 0, result.stderr


def test_prod_settings_reject_sqlite_database_url() -> None:
    environment = valid_prod_environment()
    environment["DATABASE_URL"] = "sqlite:////tmp/longevity.db"

    result = import_prod_settings(environment)

    assert result.returncode != 0
    assert "DATABASE_URL must use PostgreSQL in production" in result.stderr


@pytest.mark.parametrize(
    ("variable_name", "invalid_url"),
    (
        (
            "STRIPE_CHECKOUT_SUCCESS_URL",
            "http://localhost:5173/settings?checkout=success",
        ),
        (
            "STRIPE_CHECKOUT_CANCEL_URL",
            "http://localhost:5173/settings?checkout=cancelled",
        ),
        (
            "STRIPE_CUSTOMER_PORTAL_RETURN_URL",
            "http://localhost:5173/settings",
        ),
        (
            "STRIPE_CHECKOUT_SUCCESS_URL",
            "http://staging.example.com/settings?checkout=success",
        ),
    ),
)
def test_prod_settings_reject_unsafe_stripe_return_url(
    variable_name: str,
    invalid_url: str,
) -> None:
    environment = valid_prod_environment()
    environment[variable_name] = invalid_url

    result = import_prod_settings(environment)

    assert result.returncode != 0
    assert (
        f"{variable_name} must use a non-local HTTPS URL in production"
        in result.stderr
    )


def test_prod_settings_trust_alb_forwarded_https_header() -> None:
    result = read_prod_setting(
        valid_prod_environment(),
        "SECURE_PROXY_SSL_HEADER",
    )

    assert result.returncode == 0, result.stderr
    assert json.loads(result.stdout) == ["HTTP_X_FORWARDED_PROTO", "https"]


def test_prod_settings_redirect_http_to_https() -> None:
    result = read_prod_setting(
        valid_prod_environment(),
        "SECURE_SSL_REDIRECT",
    )

    assert result.returncode == 0, result.stderr
    assert json.loads(result.stdout) is True


def test_prod_settings_only_send_session_cookie_over_https() -> None:
    result = read_prod_setting(
        valid_prod_environment(),
        "SESSION_COOKIE_SECURE",
    )

    assert result.returncode == 0, result.stderr
    assert json.loads(result.stdout) is True


def test_prod_settings_only_send_csrf_cookie_over_https() -> None:
    result = read_prod_setting(
        valid_prod_environment(),
        "CSRF_COOKIE_SECURE",
    )

    assert result.returncode == 0, result.stderr
    assert json.loads(result.stdout) is True


def test_prod_settings_use_conservative_hsts_policy() -> None:
    environment = valid_prod_environment()

    seconds = read_prod_setting(environment, "SECURE_HSTS_SECONDS")
    include_subdomains = read_prod_setting(
        environment,
        "SECURE_HSTS_INCLUDE_SUBDOMAINS",
    )
    preload = read_prod_setting(environment, "SECURE_HSTS_PRELOAD")

    assert seconds.returncode == 0, seconds.stderr
    assert include_subdomains.returncode == 0, include_subdomains.stderr
    assert preload.returncode == 0, preload.stderr
    assert json.loads(seconds.stdout) == 300
    assert json.loads(include_subdomains.stdout) is False
    assert json.loads(preload.stdout) is False
