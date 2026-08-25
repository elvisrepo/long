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
import subprocess

import pytest

from config.settings.production_environment import (
    REQUIRED_ENVIRONMENT_VARIABLES,
)
from scripts.staging_runtime import (
    REQUIRED_RUNTIME_KEYS,
    StagingRuntimeConfigurationError,
    parse_runtime_secret,
    retrieve_secret_string,
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


def test_secret_missing_required_key_is_rejected() -> None:
    payload = {key: f"inert-{key.lower()}" for key in EXPECTED_RUNTIME_KEYS}
    del payload["DATABASE_URL"]

    with pytest.raises(
        StagingRuntimeConfigurationError,
        match="staging runtime secret is missing required key: DATABASE_URL",
    ):
        parse_runtime_secret(json.dumps(payload))


def test_secret_with_blank_required_value_is_rejected() -> None:
    payload = {key: f"inert-{key.lower()}" for key in EXPECTED_RUNTIME_KEYS}
    payload["DATABASE_URL"] = "   "

    with pytest.raises(
        StagingRuntimeConfigurationError,
        match="staging runtime secret has blank required value: DATABASE_URL",
    ):
        parse_runtime_secret(json.dumps(payload))


def test_secret_with_non_string_required_value_is_rejected() -> None:
    payload: dict[str, object] = {
        key: f"inert-{key.lower()}" for key in EXPECTED_RUNTIME_KEYS
    }
    payload["DATABASE_URL"] = None

    with pytest.raises(
        StagingRuntimeConfigurationError,
        match=(
            "staging runtime secret has non-string required value: DATABASE_URL"
        ),
    ):
        parse_runtime_secret(json.dumps(payload))


def test_secret_json_must_be_an_object() -> None:
    with pytest.raises(
        StagingRuntimeConfigurationError,
        match="staging runtime secret must be a JSON object",
    ):
        parse_runtime_secret("[]")


def test_unexpected_secret_keys_are_not_forwarded() -> None:
    payload = {key: f"inert-{key.lower()}" for key in EXPECTED_RUNTIME_KEYS}
    payload["AWS_SECRET_ACCESS_KEY"] = "must-not-be-forwarded"

    runtime_environment = parse_runtime_secret(json.dumps(payload))

    assert set(runtime_environment) == EXPECTED_RUNTIME_KEYS
    assert "AWS_SECRET_ACCESS_KEY" not in runtime_environment


def test_retrieves_one_current_secret_without_a_workstation_profile(
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    secret_value = '{"SECRET_KEY":"must-not-be-printed"}'
    commands: list[list[str]] = []

    def fake_run(
        command: list[str],
        *,
        check: bool,
        capture_output: bool,
        text: bool,
    ) -> subprocess.CompletedProcess[str]:
        commands.append(command)
        assert check is True
        assert capture_output is True
        assert text is True
        return subprocess.CompletedProcess(
            command,
            returncode=0,
            stdout=f"{secret_value}\n",
            stderr="",
        )

    monkeypatch.setattr("scripts.staging_runtime.subprocess.run", fake_run)

    result = retrieve_secret_string(
        "longevity/staging/backend-runtime",
        region="eu-central-1",
    )

    assert result == secret_value
    assert commands == [[
        "aws",
        "secretsmanager",
        "get-secret-value",
        "--secret-id",
        "longevity/staging/backend-runtime",
        "--version-stage",
        "AWSCURRENT",
        "--query",
        "SecretString",
        "--output",
        "text",
        "--region",
        "eu-central-1",
    ]]
    assert "--profile" not in commands[0]
    assert secret_value not in capsys.readouterr().out
