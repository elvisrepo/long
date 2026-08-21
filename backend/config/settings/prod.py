"""
Production settings for deployed environments.
"""

import os
from urllib.parse import urlparse

from django.core.exceptions import ImproperlyConfigured

from .base import *  # noqa: F403


DEBUG = False
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
SECURE_SSL_REDIRECT = True
SESSION_COOKIE_SECURE = True

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

for variable_name in REQUIRED_ENVIRONMENT_VARIABLES:
    if not os.environ.get(variable_name, "").strip():
        raise ImproperlyConfigured(f"{variable_name} is required in production")

if DATABASES["default"]["ENGINE"] != "django.db.backends.postgresql":  # noqa: F405
    raise ImproperlyConfigured(
        "DATABASE_URL must use PostgreSQL in production"
    )

STRIPE_RETURN_URL_VARIABLES = (
    "STRIPE_CHECKOUT_SUCCESS_URL",
    "STRIPE_CHECKOUT_CANCEL_URL",
    "STRIPE_CUSTOMER_PORTAL_RETURN_URL",
)
LOCAL_HOSTNAMES = {"localhost", "127.0.0.1", "::1"}

for variable_name in STRIPE_RETURN_URL_VARIABLES:
    parsed_url = urlparse(os.environ[variable_name])
    if (
        parsed_url.scheme != "https"
        or not parsed_url.hostname
        or parsed_url.hostname in LOCAL_HOSTNAMES
    ):
        raise ImproperlyConfigured(
            f"{variable_name} must use a non-local HTTPS URL in production"
        )
