import os
import subprocess
import sys
from pathlib import Path


BACKEND_DIR = Path(__file__).resolve().parents[1]
IMPORT_PROD_SETTINGS = "import config.settings.prod"
IMPORT_PROD_SETTINGS_WITHOUT_DOTENV = """
from unittest.mock import patch

with patch("dotenv.load_dotenv", return_value=False):
    import config.settings.prod
"""


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


def test_prod_settings_reject_an_empty_secret_key() -> None:
    environment = valid_prod_environment()
    environment["SECRET_KEY"] = ""

    result = import_prod_settings(environment)

    assert result.returncode != 0
    assert "SECRET_KEY is required in production" in result.stderr


def test_prod_settings_reject_a_missing_secret_key() -> None:
    environment = valid_prod_environment()
    environment.pop("SECRET_KEY")

    result = import_prod_settings(environment, without_dotenv=True)

    assert result.returncode != 0
    assert "SECRET_KEY is required in production" in result.stderr


def test_prod_settings_reject_an_empty_pii_encryption_key() -> None:
    environment = valid_prod_environment()
    environment["PII_ENCRYPTION_KEY"] = ""

    result = import_prod_settings(environment)

    assert result.returncode != 0
    assert "PII_ENCRYPTION_KEY is required in production" in result.stderr


def test_prod_settings_reject_an_empty_email_lookup_key() -> None:
    environment = valid_prod_environment()
    environment["EMAIL_LOOKUP_KEY"] = ""

    result = import_prod_settings(environment)

    assert result.returncode != 0
    assert "EMAIL_LOOKUP_KEY is required in production" in result.stderr
