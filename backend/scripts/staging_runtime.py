"""Build the allowlisted environment for the staging backend runtime."""

import json

from config.settings.production_environment import (
    REQUIRED_ENVIRONMENT_VARIABLES as REQUIRED_RUNTIME_KEYS,
)


def parse_runtime_secret(secret_json: str) -> dict[str, str]:
    """Return the production runtime keys from a complete JSON secret."""

    payload: dict[str, str] = json.loads(secret_json)
    return {key: payload[key] for key in REQUIRED_RUNTIME_KEYS}
