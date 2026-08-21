import os
import subprocess
import sys
from pathlib import Path


BACKEND_DIR = Path(__file__).resolve().parents[1]


def test_prod_settings_reject_an_empty_secret_key() -> None:
    environment = {
        **os.environ,
        "SECRET_KEY": "",
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

    result = subprocess.run(
        [sys.executable, "-c", "import config.settings.prod"],
        cwd=BACKEND_DIR,
        env=environment,
        capture_output=True,
        check=False,
        text=True,
    )

    assert result.returncode != 0
    assert "SECRET_KEY is required in production" in result.stderr
