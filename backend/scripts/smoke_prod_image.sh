#!/usr/bin/env bash

# Stop on the first failed command, undefined variable, or failed pipeline. A
# smoke check must fail CI instead of continuing after a broken build or import.
set -euo pipefail

image_tag="longevity-backend:production-smoke"

# Build the deployable backend Dockerfile, including its locked dependencies and
# copied application source. CI runs this script with backend/ as its directory.
docker build --tag "${image_tag}" .

# Start a disposable container with the complete production-settings contract.
# Every value below is deterministic and intentionally non-secret. The database
# URL must be PostgreSQL-shaped for prod.py, but no database connection is made:
# this check imports configuration and the WSGI application without serving a
# request or executing a query.
#
# The arguments after the image tag override its long-running default command.
# Gunicorn's `--env` selects fail-safe production settings; `--check-config`
# imports Django's WSGI callable, validates configuration, and exits. Static
# pytest contracts separately protect the Dockerfile's real worker, timeout,
# and logging flags.
docker run --rm \
  --env SECRET_KEY=smoke-secret-key \
  --env PII_ENCRYPTION_KEY=smoke-pii-key \
  --env EMAIL_LOOKUP_KEY=smoke-email-lookup-key \
  --env JWT_SIGNING_KEY=smoke-jwt-signing-key \
  --env "DATABASE_URL=postgresql://smoke:smoke@database:5432/longevity" \
  --env ALLOWED_HOSTS=staging.example.com \
  --env "CSRF_TRUSTED_ORIGINS=https://staging.example.com" \
  --env STRIPE_SECRET_KEY=sk_test_smoke \
  --env STRIPE_WEBHOOK_SECRET=whsec_smoke \
  --env "STRIPE_CHECKOUT_SUCCESS_URL=https://staging.example.com/settings?checkout=success" \
  --env "STRIPE_CHECKOUT_CANCEL_URL=https://staging.example.com/settings?checkout=cancelled" \
  --env "STRIPE_CUSTOMER_PORTAL_RETURN_URL=https://staging.example.com/settings" \
  --env LOG_LEVEL=INFO \
  --env DJANGO_LOG_LEVEL=INFO \
  "${image_tag}" \
  gunicorn \
  --check-config \
  --env DJANGO_SETTINGS_MODULE=config.settings.prod \
  config.wsgi:application
