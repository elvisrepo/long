"""Contract tests for staging runtime configuration injection.

AWS and Docker boundaries are replaced with test doubles in this module. The
real migration-first Docker flow is intentionally deferred to the Step 8 smoke
test; these tests protect the configuration loaded before Docker is invoked.

Scenario list:

- accept one complete JSON secret containing the production runtime inventory
- reject malformed JSON before invoking Docker
- reject a missing required key before invoking Docker
- reject a blank required value before invoking Docker
- reject non-string values before invoking Docker
- omit unexpected keys from the container environment
- avoid disclosing secret values in normal and error output
- load one configuration snapshot for the deployment command
- Step 8: pass that same snapshot to migration and API containers
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
    load_runtime_environment,
    main,
    parse_runtime_secret,
    run_deployment_command,
    retrieve_secret_string,
)


# Keep this oracle explicit and independent. Production consumers share the
# canonical tuple; this set makes an intentional key addition/removal require a
# corresponding contract-test decision instead of silently accepting drift.
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
    # Use a credential-shaped field to prove arbitrary secret JSON cannot widen
    # the child/container environment beyond the canonical allowlist.
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

    # This double proves command shape and capture behavior without contacting
    # AWS or requiring a developer credential profile.
    def fake_run(
        command: list[str],
        *,
        check: bool,
        capture_output: bool,
        text: bool,
        env: dict[str, str] | None = None,
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


def test_secret_retrieval_uses_only_ec2_instance_role_credentials(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    inherited_credentials = {
        "AWS_PROFILE": "longevity-staging",
        "AWS_ACCESS_KEY_ID": "must-not-be-inherited",
        "AWS_SECRET_ACCESS_KEY": "must-not-be-inherited",
        "AWS_SESSION_TOKEN": "must-not-be-inherited",
        "AWS_WEB_IDENTITY_TOKEN_FILE": "/tmp/must-not-be-inherited",
        "AWS_CONTAINER_CREDENTIALS_FULL_URI": "http://must-not-be-inherited",
    }
    for key, value in inherited_credentials.items():
        monkeypatch.setenv(key, value)

    subprocess_environments: list[dict[str, str]] = []

    def fake_run(
        command: list[str],
        *,
        check: bool,
        capture_output: bool,
        text: bool,
        env: dict[str, str],
    ) -> subprocess.CompletedProcess[str]:
        subprocess_environments.append(env)
        return subprocess.CompletedProcess(
            command,
            returncode=0,
            stdout="{}\n",
            stderr="",
        )

    monkeypatch.setattr("scripts.staging_runtime.subprocess.run", fake_run)

    retrieve_secret_string(
        "longevity/staging/backend-runtime",
        region="eu-central-1",
    )

    assert len(subprocess_environments) == 1
    aws_environment = subprocess_environments[0]
    assert inherited_credentials.keys().isdisjoint(aws_environment)
    assert aws_environment["AWS_CONFIG_FILE"] == "/dev/null"
    assert aws_environment["AWS_SHARED_CREDENTIALS_FILE"] == "/dev/null"
    assert aws_environment["AWS_EC2_METADATA_DISABLED"] == "false"


def test_secret_retrieval_failure_is_redacted(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    sensitive_output = "must-not-appear"

    def fake_run(
        command: list[str],
        *,
        check: bool,
        capture_output: bool,
        text: bool,
        env: dict[str, str],
    ) -> subprocess.CompletedProcess[str]:
        raise subprocess.CalledProcessError(
            returncode=1,
            cmd=command,
            output=sensitive_output,
            stderr=sensitive_output,
        )

    monkeypatch.setattr("scripts.staging_runtime.subprocess.run", fake_run)

    with pytest.raises(
        StagingRuntimeConfigurationError,
        match="unable to retrieve staging runtime secret",
    ) as error:
        retrieve_secret_string(
            "longevity/staging/backend-runtime",
            region="eu-central-1",
        )

    assert sensitive_output not in str(error.value)


def test_loads_one_secret_snapshot_per_deployment_attempt(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    payload = {key: f"inert-{key.lower()}" for key in EXPECTED_RUNTIME_KEYS}
    retrievals: list[tuple[str, str]] = []

    # Recording calls protects the one-fetch rule needed to prevent rotation
    # from giving migration and API different secret versions.
    def fake_retrieve_secret_string(secret_id: str, *, region: str) -> str:
        retrievals.append((secret_id, region))
        return json.dumps(payload)

    monkeypatch.setattr(
        "scripts.staging_runtime.retrieve_secret_string",
        fake_retrieve_secret_string,
    )

    runtime_environment = load_runtime_environment(
        "longevity/staging/backend-runtime",
        region="eu-central-1",
    )

    assert retrievals == [
        ("longevity/staging/backend-runtime", "eu-central-1")
    ]
    assert runtime_environment == payload


def test_deployment_command_receives_snapshot_without_values_in_arguments(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    runtime_environment = {
        key: f"sensitive-{key.lower()}" for key in EXPECTED_RUNTIME_KEYS
    }
    command = ["docker", "compose", "up", "--detach", "api"]
    invocations: list[tuple[list[str], dict[str, str]]] = []

    # Capture argv and env separately: values belong only in the latter and are
    # never passed to a real Docker process in this unit test.
    def fake_run(
        invoked_command: list[str],
        *,
        check: bool,
        env: dict[str, str],
    ) -> subprocess.CompletedProcess[str]:
        assert check is True
        invocations.append((invoked_command, env))
        return subprocess.CompletedProcess(invoked_command, returncode=0)

    monkeypatch.setattr("scripts.staging_runtime.subprocess.run", fake_run)

    run_deployment_command(command, runtime_environment)

    assert len(invocations) == 1
    invoked_command, child_environment = invocations[0]
    assert invoked_command == command
    assert all(
        value not in invoked_command for value in runtime_environment.values()
    )
    assert {
        key: child_environment[key] for key in EXPECTED_RUNTIME_KEYS
    } == runtime_environment


def test_cli_loads_one_snapshot_and_runs_one_deployment_command(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    runtime_environment = {
        key: f"sensitive-{key.lower()}" for key in EXPECTED_RUNTIME_KEYS
    }
    loads: list[tuple[str, str]] = []
    deployments: list[tuple[list[str], dict[str, str]]] = []

    def fake_load_runtime_environment(
        secret_id: str,
        *,
        region: str,
    ) -> dict[str, str]:
        loads.append((secret_id, region))
        return runtime_environment

    def fake_run_deployment_command(
        command: list[str],
        environment: dict[str, str],
    ) -> None:
        deployments.append((command, environment))

    monkeypatch.setattr(
        "scripts.staging_runtime.load_runtime_environment",
        fake_load_runtime_environment,
    )
    monkeypatch.setattr(
        "scripts.staging_runtime.run_deployment_command",
        fake_run_deployment_command,
    )

    exit_code = main([
        "--secret-id",
        "longevity/staging/backend-runtime",
        "--region",
        "eu-central-1",
        "--",
        "docker",
        "compose",
        "up",
        "--detach",
        "api",
    ])

    assert exit_code == 0
    assert loads == [
        ("longevity/staging/backend-runtime", "eu-central-1")
    ]
    assert deployments == [(
        ["docker", "compose", "up", "--detach", "api"],
        runtime_environment,
    )]


def test_cli_reports_configuration_failure_without_traceback(
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    deployment_was_called = False

    def fake_load_runtime_environment(
        secret_id: str,
        *,
        region: str,
    ) -> dict[str, str]:
        raise StagingRuntimeConfigurationError(
            "unable to retrieve staging runtime secret"
        )

    def fake_run_deployment_command(
        command: list[str],
        environment: dict[str, str],
    ) -> None:
        nonlocal deployment_was_called
        deployment_was_called = True

    monkeypatch.setattr(
        "scripts.staging_runtime.load_runtime_environment",
        fake_load_runtime_environment,
    )
    monkeypatch.setattr(
        "scripts.staging_runtime.run_deployment_command",
        fake_run_deployment_command,
    )

    exit_code = main([
        "--secret-id",
        "longevity/staging/backend-runtime",
        "--region",
        "eu-central-1",
        "--",
        "docker",
        "compose",
        "up",
    ])

    captured = capsys.readouterr()
    assert exit_code == 1
    assert captured.out == ""
    assert captured.err == "error: unable to retrieve staging runtime secret\n"
    assert "Traceback" not in captured.err
    assert deployment_was_called is False


def test_cli_preserves_deployment_failure_status_without_traceback(
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    runtime_environment = {
        key: f"sensitive-{key.lower()}" for key in EXPECTED_RUNTIME_KEYS
    }

    def fake_load_runtime_environment(
        secret_id: str,
        *,
        region: str,
    ) -> dict[str, str]:
        return runtime_environment

    def fake_run_deployment_command(
        command: list[str],
        environment: dict[str, str],
    ) -> None:
        raise subprocess.CalledProcessError(returncode=17, cmd=command)

    monkeypatch.setattr(
        "scripts.staging_runtime.load_runtime_environment",
        fake_load_runtime_environment,
    )
    monkeypatch.setattr(
        "scripts.staging_runtime.run_deployment_command",
        fake_run_deployment_command,
    )

    exit_code = main([
        "--secret-id",
        "longevity/staging/backend-runtime",
        "--region",
        "eu-central-1",
        "--",
        "docker",
        "compose",
        "up",
    ])

    captured = capsys.readouterr()
    assert exit_code == 17
    assert captured.out == ""
    assert captured.err == "error: deployment command failed with exit code 17\n"
    assert "Traceback" not in captured.err
    assert all(value not in captured.err for value in runtime_environment.values())
