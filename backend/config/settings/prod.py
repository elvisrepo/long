"""
Production settings for deployed environments.
"""

import os

from django.core.exceptions import ImproperlyConfigured

from .base import *  # noqa: F403


DEBUG = False

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
