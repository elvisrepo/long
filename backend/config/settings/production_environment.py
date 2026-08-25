"""Canonical environment-variable inventory for production runtimes.

Django and the host-side deployment loader import this tuple so startup
validation and Secrets Manager injection cannot evolve as separate contracts.
The tuple order is deliberate: validation reports the first missing or invalid
key deterministically.
"""


REQUIRED_ENVIRONMENT_VARIABLES = (
    # Long-lived application and cryptographic material. Rotation of the PII,
    # lookup, and signing keys requires a deliberate compatibility plan.
    "SECRET_KEY",
    "PII_ENCRYPTION_KEY",
    "EMAIL_LOOKUP_KEY",
    "JWT_SIGNING_KEY",
    # Database and public-origin configuration travel in the same versioned
    # JSON snapshot so migration and API processes cannot observe mixed config.
    "DATABASE_URL",
    "ALLOWED_HOSTS",
    "CSRF_TRUSTED_ORIGINS",
    # Staging uses Stripe test-mode credentials and HTTPS browser return URLs.
    "STRIPE_SECRET_KEY",
    "STRIPE_WEBHOOK_SECRET",
    "STRIPE_CHECKOUT_SUCCESS_URL",
    "STRIPE_CHECKOUT_CANCEL_URL",
    "STRIPE_CUSTOMER_PORTAL_RETURN_URL",
    # Logging is explicit in public runtimes; DEBUG remains forced off by
    # prod.py and Redis is intentionally absent from the initial staging stack.
    "LOG_LEVEL",
    "DJANGO_LOG_LEVEL",
)
