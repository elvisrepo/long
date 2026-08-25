"""Load staging configuration and pass it to host deployment tooling.

This module runs on the EC2 host, not inside the Django image. It retrieves one
Secrets Manager version through the instance role, validates it without writing
an `.env`, then launches one deployment command with the values in memory.
"""

import argparse
import json
import os
import subprocess
import sys
from collections.abc import Mapping, Sequence

from config.settings.production_environment import (
    REQUIRED_ENVIRONMENT_VARIABLES as REQUIRED_RUNTIME_KEYS,
)


AWS_CREDENTIAL_ENVIRONMENT_VARIABLES = (
    # A Systems Manager shell may inherit operator or tool credentials. Remove
    # every alternate AWS credential-provider input so the host's instance
    # profile is the only identity available to the AWS CLI subprocess.
    "AWS_PROFILE",
    "AWS_DEFAULT_PROFILE",
    "AWS_ACCESS_KEY_ID",
    "AWS_SECRET_ACCESS_KEY",
    "AWS_SESSION_TOKEN",
    "AWS_SECURITY_TOKEN",
    "AWS_WEB_IDENTITY_TOKEN_FILE",
    "AWS_ROLE_ARN",
    "AWS_ROLE_SESSION_NAME",
    "AWS_CONTAINER_CREDENTIALS_RELATIVE_URI",
    "AWS_CONTAINER_CREDENTIALS_FULL_URI",
    "AWS_CONTAINER_AUTHORIZATION_TOKEN",
    "AWS_CONTAINER_AUTHORIZATION_TOKEN_FILE",
)


class StagingRuntimeConfigurationError(ValueError):
    """Report invalid staging configuration without exposing secret values."""


def ec2_instance_role_environment() -> dict[str, str]:
    """Return a subprocess environment limited to EC2 role credentials."""

    environment = os.environ.copy()
    for variable_name in AWS_CREDENTIAL_ENVIRONMENT_VARIABLES:
        environment.pop(variable_name, None)
    # Empty config files also block implicit default/shared profiles that are
    # not represented by environment variables. IMDS remains explicitly on.
    environment["AWS_CONFIG_FILE"] = "/dev/null"
    environment["AWS_SHARED_CREDENTIALS_FILE"] = "/dev/null"
    environment["AWS_EC2_METADATA_DISABLED"] = "false"
    return environment


def retrieve_secret_string(secret_id: str, *, region: str) -> str:
    """Retrieve one current Secrets Manager value through the EC2 identity."""

    try:
        # `--query SecretString` avoids handling response metadata. Capturing
        # output prevents the decrypted value from being printed by this layer.
        result = subprocess.run(
            [
                "aws",
                "secretsmanager",
                "get-secret-value",
                "--secret-id",
                secret_id,
                "--version-stage",
                "AWSCURRENT",
                "--query",
                "SecretString",
                "--output",
                "text",
                "--region",
                region,
            ],
            check=True,
            capture_output=True,
            text=True,
            env=ec2_instance_role_environment(),
        )
    except (OSError, subprocess.CalledProcessError):
        # AWS stderr can contain operational context that should not be copied
        # into deployment logs. Higher layers receive only this fixed message.
        raise StagingRuntimeConfigurationError(
            "unable to retrieve staging runtime secret"
        ) from None

    return result.stdout.rstrip("\r\n")


def parse_runtime_secret(secret_json: str) -> dict[str, str]:
    """Return the production runtime keys from a complete JSON secret."""

    try:
        payload: object = json.loads(secret_json)
    except json.JSONDecodeError:
        raise StagingRuntimeConfigurationError(
            "staging runtime secret must be valid JSON"
        ) from None

    if not isinstance(payload, dict):
        raise StagingRuntimeConfigurationError(
            "staging runtime secret must be a JSON object"
        )

    # Build a fresh dictionary from the canonical allowlist. Extra JSON fields
    # are intentionally dropped instead of becoming container environment.
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


def load_runtime_environment(secret_id: str, *, region: str) -> dict[str, str]:
    """Retrieve and validate one staging configuration snapshot."""

    # Fetch once. The returned dictionary is the snapshot that the deployment
    # command must reuse for migration and API startup.
    secret_json = retrieve_secret_string(secret_id, region=region)
    return parse_runtime_secret(secret_json)


def run_deployment_command(
    command: Sequence[str],
    runtime_environment: Mapping[str, str],
) -> None:
    """Run one deployment command with runtime values only in its environment."""

    # Values never enter argv or a persistent file. They are still visible to
    # privileged host/Docker operators, which is part of the deployment trust
    # boundary documented in the staging audit.
    child_environment = ec2_instance_role_environment()
    child_environment.update(runtime_environment)
    subprocess.run(list(command), check=True, env=child_environment)


def main(argv: Sequence[str] | None = None) -> int:
    """Load one runtime snapshot and execute one deployment command."""

    parser = argparse.ArgumentParser()
    parser.add_argument("--secret-id", required=True)
    parser.add_argument("--region", required=True)
    parser.add_argument("command", nargs=argparse.REMAINDER)
    arguments = parser.parse_args(list(argv) if argv is not None else None)

    # `--` separates wrapper arguments from an arbitrary deployment command;
    # argparse retains it for REMAINDER, so remove only that leading separator.
    command: list[str] = arguments.command
    if command[:1] == ["--"]:
        command = command[1:]
    if not command:
        parser.error("a deployment command is required after --")

    try:
        runtime_environment = load_runtime_environment(
            arguments.secret_id,
            region=arguments.region,
        )
    except StagingRuntimeConfigurationError as error:
        # Expected configuration failures are already redacted and should not
        # produce a traceback that might expose local process state.
        print(f"error: {error}", file=sys.stderr)
        return 1

    try:
        run_deployment_command(command, runtime_environment)
    except subprocess.CalledProcessError as error:
        # Preserve ordinary child statuses for CI/deployment gating. Normalize
        # signal or out-of-range values to a portable failure code.
        exit_code = error.returncode if 1 <= error.returncode <= 255 else 1
        print(
            f"error: deployment command failed with exit code {exit_code}",
            file=sys.stderr,
        )
        return exit_code
    except OSError:
        print("error: unable to start deployment command", file=sys.stderr)
        return 1

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
