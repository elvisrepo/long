"""
Test settings for the automated test suite.
"""

from .base import *  # noqa: F403


DEBUG = False

PASSWORD_HASHERS = [
    "django.contrib.auth.hashers.MD5PasswordHasher",
]

PII_ENCRYPTION_KEY = "8xSPkbwoMvV7Y4NNyG8_N0-LLf9a8q0lVq2dNfXl4zQ="
EMAIL_LOOKUP_KEY = "test-email-lookup-key"
SECRET_KEY = "test-secret-key-at-least-32-bytes-long-for-jwt"