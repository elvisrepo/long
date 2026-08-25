"""Fail-safe settings for public staging and production deployments."""

import os
from urllib.parse import urlparse

from django.core.exceptions import ImproperlyConfigured

from .base import *  # noqa: F403
from .production_environment import REQUIRED_ENVIRONMENT_VARIABLES


DEBUG = False

# The ALB terminates TLS before forwarding requests to Django. The application
# host must therefore accept web traffic only from that trusted proxy.
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
SECURE_SSL_REDIRECT = True
SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True

# Keep the first staging HSTS window recoverable. Increase it, include
# subdomains, and consider preload only after every affected host is HTTPS-only.
SECURE_HSTS_SECONDS = 300
SECURE_HSTS_INCLUDE_SUBDOMAINS = False
SECURE_HSTS_PRELOAD = False

# Check the post-dotenv environment directly. Values imported from base.py may
# contain development fallbacks, which production must never accept silently.
for variable_name in REQUIRED_ENVIRONMENT_VARIABLES:
    if not os.environ.get(variable_name, "").strip():
        raise ImproperlyConfigured(f"{variable_name} is required in production")

# The deployed data store is managed PostgreSQL; local SQLite is intentionally
# supported only by non-production settings.
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

# Stripe-hosted browser flows must return users to the public HTTPS application,
# never to a developer machine or a plaintext origin.
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
