"""
Production settings for deployed environments.
"""

import os

from django.core.exceptions import ImproperlyConfigured

from .base import *  # noqa: F403


DEBUG = False

if not os.environ.get("SECRET_KEY", "").strip():
    raise ImproperlyConfigured("SECRET_KEY is required in production")
