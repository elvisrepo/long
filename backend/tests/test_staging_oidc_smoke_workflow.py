"""Contract tests for the non-mutating GitHub-to-AWS OIDC smoke workflow."""

from pathlib import Path
from typing import Any, cast

import yaml


REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
OIDC_SMOKE_WORKFLOW = REPOSITORY_ROOT / ".github/workflows/staging-oidc-smoke.yml"


def load_oidc_smoke_workflow() -> dict[str, Any]:
    return cast(
        dict[str, Any],
        yaml.load(OIDC_SMOKE_WORKFLOW.read_text(), Loader=yaml.BaseLoader),
    )


def test_oidc_smoke_is_manual_and_staging_only() -> None:
    workflow = load_oidc_smoke_workflow()
    job = workflow["jobs"]["oidc-smoke"]

    assert workflow["on"] == {"workflow_dispatch": ""}
    assert job["runs-on"] == "ubuntu-24.04"
    assert job["environment"] == "staging"
    assert job["if"] == "github.ref == 'refs/heads/staging'"


def test_oidc_smoke_uses_short_lived_credentials_and_verifies_the_role() -> None:
    workflow = load_oidc_smoke_workflow()
    permissions = workflow["permissions"]
    steps = workflow["jobs"]["oidc-smoke"]["steps"]
    configure_credentials = steps[0]
    verify_role = steps[1]
    configure_with = configure_credentials["with"]
    verification_script = verify_role["run"]

    assert permissions == {"contents": "read", "id-token": "write"}
    assert configure_credentials["uses"] == (
        "aws-actions/configure-aws-credentials@"
        "e1253824e5c10ff9df46874f81ed3ec929e19cfd"
    )
    assert configure_with["role-to-assume"] == "${{ vars.AWS_ROLE_ARN }}"
    assert configure_with["aws-region"] == "${{ vars.AWS_REGION }}"
    assert configure_with["allowed-account-ids"] == "173291122778"
    assert "aws sts get-caller-identity --output json" in verification_script
    assert (
        workflow["jobs"]["oidc-smoke"]["env"]["EXPECTED_AWS_ROLE_NAME"]
        == "syncvitals-staging-github-deploy-role"
    )

    workflow_text = OIDC_SMOKE_WORKFLOW.read_text()
    assert "secrets." not in workflow_text
    assert "AWS_ACCESS_KEY_ID" not in workflow_text
