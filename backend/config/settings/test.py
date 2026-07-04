"""
Test settings for the automated test suite.
"""

from .base import *  # noqa: F403
from .base import SIMPLE_JWT as BASE_SIMPLE_JWT

# Automated tests must never use credentials loaded from a developer's .env file.
STRIPE_SECRET_KEY = "sk_test_fake"
STRIPE_WEBHOOK_SECRET = "whsec_fake"
STRIPE_CHECKOUT_SUCCESS_URL = (
      "http://localhost:5173/settings?checkout=success"
  )
STRIPE_CHECKOUT_CANCEL_URL = (
      "http://localhost:5173/settings?checkout=cancelled"
  )
STRIPE_CUSTOMER_PORTAL_RETURN_URL = "http://localhost:5173/settings"


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
