"""Contract tests for staging runtime configuration injection.

Scenario list:

- accept one complete JSON secret containing the production runtime inventory
- reject malformed JSON before invoking Docker
- reject a missing required key before invoking Docker
- reject a blank required value before invoking Docker
- reject non-string values before invoking Docker
- omit unexpected keys from the container environment
- avoid disclosing secret values in normal and error output
- pass one configuration snapshot to migration and API containers
"""

import json

import pytest

from config.settings.production_environment import (
    REQUIRED_ENVIRONMENT_VARIABLES,
)
from scripts.staging_runtime import (
    REQUIRED_RUNTIME_KEYS,
    StagingRuntimeConfigurationError,
    parse_runtime_secret,
)


EXPECTED_RUNTIME_KEYS = {
    "SECRET_KEY",
    "PII_ENCRYPTION_KEY",
    "EMAIL_LOOKUP_KEY",
    "JWT_SIGNING_KEY",
    "DATABASE_URL",
    "ALLOWED_HOSTS",
    "CSRF_TRUSTED_ORIGINS",
    "STRIPE_SECRET_KEY",
    "STRIPE_WEBHOOK_SECRET",
    "STRIPE_CHECKOUT_SUCCESS_URL",
    "STRIPE_CHECKOUT_CANCEL_URL",
    "STRIPE_CUSTOMER_PORTAL_RETURN_URL",
    "LOG_LEVEL",
    "DJANGO_LOG_LEVEL",
}


def test_complete_staging_secret_defines_production_runtime_inventory() -> None:
    payload = {key: f"inert-{key.lower()}" for key in EXPECTED_RUNTIME_KEYS}

    runtime_environment = parse_runtime_secret(json.dumps(payload))

    assert set(REQUIRED_RUNTIME_KEYS) == EXPECTED_RUNTIME_KEYS
    assert runtime_environment == payload


def test_staging_parser_uses_canonical_production_inventory() -> None:
    assert REQUIRED_RUNTIME_KEYS is REQUIRED_ENVIRONMENT_VARIABLES


def test_malformed_secret_json_is_rejected_without_disclosing_it() -> None:
    malformed_secret = '{"SECRET_KEY": "must-not-appear",'

    with pytest.raises(
        StagingRuntimeConfigurationError,
        match="staging runtime secret must be valid JSON",
    ) as error:
        parse_runtime_secret(malformed_secret)

    assert "must-not-appear" not in str(error.value)
