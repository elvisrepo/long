"""
Test settings for the automated test suite.
"""

from .base import *  # noqa: F403


DEBUG = False

PASSWORD_HASHERS = [
    "django.contrib.auth.hashers.MD5PasswordHasher",
]
