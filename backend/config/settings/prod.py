"""
Production settings for deployed environments.
"""

from django.core.exceptions import ImproperlyConfigured

from .base import *  # noqa: F403


DEBUG = False

if not SECRET_KEY.strip():  # noqa: F405
    raise ImproperlyConfigured("SECRET_KEY is required in production")
