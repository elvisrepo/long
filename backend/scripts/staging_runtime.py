"""Build the allowlisted environment for the staging backend runtime."""

import json

from config.settings.production_environment import (
    REQUIRED_ENVIRONMENT_VARIABLES as REQUIRED_RUNTIME_KEYS,
)


class StagingRuntimeConfigurationError(ValueError):
    """Report invalid staging configuration without exposing secret values."""


def parse_runtime_secret(secret_json: str) -> dict[str, str]:
    """Return the production runtime keys from a complete JSON secret."""

    try:
        payload: dict[str, object] = json.loads(secret_json)
    except json.JSONDecodeError:
        raise StagingRuntimeConfigurationError(
            "staging runtime secret must be valid JSON"
        ) from None

    runtime_environment: dict[str, str] = {}
    for key in REQUIRED_RUNTIME_KEYS:
        if key not in payload:
            raise StagingRuntimeConfigurationError(
                f"staging runtime secret is missing required key: {key}"
            )
        value = payload[key]
        if not isinstance(value, str):
            raise StagingRuntimeConfigurationError(
                f"staging runtime secret has non-string required value: {key}"
            )
        if not value.strip():
            raise StagingRuntimeConfigurationError(
                f"staging runtime secret has blank required value: {key}"
            )
        runtime_environment[key] = value

    return runtime_environment
