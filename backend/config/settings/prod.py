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
)

for variable_name in REQUIRED_ENVIRONMENT_VARIABLES:
    if not os.environ.get(variable_name, "").strip():
        raise ImproperlyConfigured(f"{variable_name} is required in production")
