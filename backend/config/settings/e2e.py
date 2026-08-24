"""
Settings for the browser-driven E2E runtime.
"""

import os

import dj_database_url

from .base import *  # noqa: F403
from .base import SIMPLE_JWT as BASE_SIMPLE_JWT


DEBUG = False
ENABLE_E2E_TESTING_API = True

SECRET_KEY = os.environ.get(
    "E2E_SECRET_KEY",
    "e2e-secret-key-at-least-32-bytes-long-for-local-browser-tests",
)
PII_ENCRYPTION_KEY = os.environ.get(
    "E2E_PII_ENCRYPTION_KEY",
    "8xSPkbwoMvV7Y4NNyG8_N0-LLf9a8q0lVq2dNfXl4zQ=",
)
EMAIL_LOOKUP_KEY = os.environ.get(
    "E2E_EMAIL_LOOKUP_KEY",
    "e2e-email-lookup-key",
)
JWT_SIGNING_KEY = os.environ.get(
    "E2E_JWT_SIGNING_KEY",
    "e2e-jwt-signing-key-at-least-32-bytes-long",
)

# Never inherit developer Stripe credentials loaded by base.py. These values
# are deliberately inert and fixed: browser E2E must not become a Stripe
# sandbox integration suite merely because a local .env contains valid keys.
STRIPE_OUTBOUND_API_ENABLED = False
STRIPE_SECRET_KEY = "e2e-stripe-api-disabled"
STRIPE_WEBHOOK_SECRET = "e2e-webhook-disabled"
STRIPE_CHECKOUT_SUCCESS_URL = (
    "http://127.0.0.1:5173/settings?checkout=success"
)
STRIPE_CHECKOUT_CANCEL_URL = (
    "http://127.0.0.1:5173/settings?checkout=cancelled"
)
STRIPE_CUSTOMER_PORTAL_RETURN_URL = "http://127.0.0.1:5173/settings"

DATABASES = {
    "default": dj_database_url.parse(
        # Keep browser E2E writes out of the normal dev database.
        os.environ.get(
            "E2E_DATABASE_URL",
            "postgresql://postgres:postgres@db-e2e:5432/longevity_e2e",
        ),
        conn_max_age=0,
    )
}

ALLOWED_HOSTS = [
    host.strip()
    for host in os.environ.get(
        "E2E_ALLOWED_HOSTS",
        "localhost,127.0.0.1,web-e2e",
    ).split(",")
    if host.strip()
]

CSRF_TRUSTED_ORIGINS = [
    origin.strip()
    for origin in os.environ.get(
        "E2E_CSRF_TRUSTED_ORIGINS",
        "http://127.0.0.1:5173,http://localhost:5173",
    ).split(",")
    if origin.strip()
]

PASSWORD_HASHERS = [
    # Browser E2E exercises auth behavior, not password-hashing cost.
    "django.contrib.auth.hashers.MD5PasswordHasher",
]

SIMPLE_JWT = {
    **BASE_SIMPLE_JWT,
    "SIGNING_KEY": JWT_SIGNING_KEY,
}
