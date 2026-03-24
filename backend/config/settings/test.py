"""
Test settings for the automated test suite.
"""

from .base import *  # noqa: F403
from .base import SIMPLE_JWT as BASE_SIMPLE_JWT


DEBUG = False

PASSWORD_HASHERS = [
    "django.contrib.auth.hashers.MD5PasswordHasher",
]

PII_ENCRYPTION_KEY = "8xSPkbwoMvV7Y4NNyG8_N0-LLf9a8q0lVq2dNfXl4zQ="
EMAIL_LOOKUP_KEY = "test-email-lookup-key"
SECRET_KEY = "test-secret-key-at-least-32-bytes-long-for-jwt"

JWT_SIGNING_KEY = "test-jwt-signing-key-at-least-32-bytes-long"
SIMPLE_JWT = {
      **BASE_SIMPLE_JWT,
      "SIGNING_KEY": JWT_SIGNING_KEY,
  }
