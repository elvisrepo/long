"""Contract tests for the non-mutating GitHub-to-AWS OIDC smoke workflow."""

from pathlib import Path


REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
OIDC_SMOKE_WORKFLOW = REPOSITORY_ROOT / ".github/workflows/staging-oidc-smoke.yml"


def test_oidc_smoke_is_manual_and_staging_only() -> None:
    workflow = OIDC_SMOKE_WORKFLOW.read_text()

    assert "  workflow_dispatch:\n" in workflow
    assert "  push:" not in workflow
    assert "  pull_request:" not in workflow
    assert "runs-on: ubuntu-24.04" in workflow
    assert "environment: staging" in workflow
    assert "if: github.ref == 'refs/heads/staging'" in workflow


def test_oidc_smoke_uses_short_lived_credentials_and_verifies_the_role() -> None:
    workflow = OIDC_SMOKE_WORKFLOW.read_text()

    assert "  id-token: write\n" in workflow
    assert (
        "uses: aws-actions/configure-aws-credentials@"
        "e1253824e5c10ff9df46874f81ed3ec929e19cfd # v6.3.0"
        in workflow
    )
    assert "role-to-assume: ${{ vars.AWS_ROLE_ARN }}" in workflow
    assert "aws-region: ${{ vars.AWS_REGION }}" in workflow
    assert 'allowed-account-ids: "173291122778"' in workflow
    assert "aws sts get-caller-identity --output json" in workflow
    assert "syncvitals-staging-github-deploy-role" in workflow
    assert "secrets." not in workflow
    assert "AWS_ACCESS_KEY_ID" not in workflow
