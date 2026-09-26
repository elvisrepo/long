"""Contract tests for the manual staging deployment workflow."""

from pathlib import Path
import subprocess
from typing import Any, cast

import yaml


REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
STAGING_DEPLOY_WORKFLOW = REPOSITORY_ROOT / ".github/workflows/staging-deploy.yml"
STAGING_PLAYBOOK = (
    REPOSITORY_ROOT
    / "reference_docs/playbooks/presentation-staging-manual-provisioning.md"
)
INFRASTRUCTURE_DOC = (
    REPOSITORY_ROOT / "reference_docs/knowledge/22-infrastructure-and-devops.md"
)


def load_staging_deploy_workflow() -> dict[str, Any]:
    return cast(
        dict[str, Any],
        yaml.load(STAGING_DEPLOY_WORKFLOW.read_text(), Loader=yaml.BaseLoader),
    )


def test_staging_deploy_runs_after_ci_on_staging_push_or_manual_dispatch() -> None:
    workflow = load_staging_deploy_workflow()
    job = workflow["jobs"]["deploy"]

    assert workflow["on"] == {
        "push": {"branches": ["staging"]},
        "workflow_dispatch": {
            "inputs": {
                "component": {
                    "description": (
                        "Deploy only after the current staging run finishes"
                    ),
                    "required": "true",
                    "type": "choice",
                    "options": ["both", "backend", "frontend"],
                }
            }
        }
    }
    assert workflow["jobs"]["backend_ci"] == {
        "uses": "./.github/workflows/backend-ci.yml"
    }
    assert workflow["jobs"]["frontend_ci"] == {
        "uses": "./.github/workflows/frontend-ci.yml"
    }
    assert job["needs"] == ["backend_ci", "frontend_ci"]
    assert job["if"] == "github.ref == 'refs/heads/staging'"
    assert job["environment"] == "staging"
    assert job["runs-on"] == "ubuntu-24.04"
    assert workflow["concurrency"] == {
        "group": "staging-deployment",
        "cancel-in-progress": "false",
    }


def test_staging_deploy_uses_short_lived_least_privilege_identity() -> None:
    workflow = load_staging_deploy_workflow()
    steps = workflow["jobs"]["deploy"]["steps"]

    assert workflow["permissions"] == {"contents": "read"}
    assert workflow["jobs"]["deploy"]["permissions"] == {
        "contents": "read",
        "id-token": "write",
    }
    assert steps[0] == {
        "name": "Checkout reviewed staging commit",
        "uses": (
            "actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1"
        ),
        "with": {"fetch-depth": "0"},
    }
    assert steps[2]["uses"] == (
        "aws-actions/configure-aws-credentials@"
        "e1253824e5c10ff9df46874f81ed3ec929e19cfd"
    )
    assert steps[2]["with"] == {
        "role-to-assume": "${{ vars.AWS_ROLE_ARN }}",
        "aws-region": "${{ vars.AWS_REGION }}",
        "allowed-account-ids": "173291122778",
        "role-session-name": "staging-deploy-${{ github.run_id }}",
        "role-duration-seconds": "3600",
        "mask-aws-account-id": "true",
        "unset-current-credentials": "true",
    }

    workflow_text = STAGING_DEPLOY_WORKFLOW.read_text()
    assert "secrets." not in workflow_text
    assert "AWS_ACCESS_KEY_ID" not in workflow_text


def test_staging_deploy_blocks_when_host_bundle_differs_from_installed_pin() -> None:
    workflow = load_staging_deploy_workflow()
    steps = workflow["jobs"]["deploy"]["steps"]
    gate = steps[1]

    assert gate["name"] == "Require installed host bundle compatibility"
    assert gate["working-directory"] == "backend"
    assert gate["env"] == {
        "INSTALLED_HOST_BUNDLE_COMMIT": (
            "c8985ae8083247a0c8ee55e3d530ffcb0bb0d29a"
        )
    }
    script = gate["run"]
    normalized_script = " ".join(script.replace("\\\n", " ").split())
    assert "from scripts.build_staging_bundle import BUNDLE_FILES" in script
    assert 'bundle_file_list="$(python3 -c' in script
    assert '[[ -n "$bundle_file_list" ]]' in script
    assert 'mapfile -t bundle_files <<< "$bundle_file_list"' in script
    assert 'bundle_files+=(scripts/build_staging_bundle.py)' in script
    assert (
        'git diff --quiet "$INSTALLED_HOST_BUNDLE_COMMIT" "$GITHUB_SHA" -- '
        '"${bundle_files[@]}"'
    ) in normalized_script
    assert "Install and verify the matching EC2 host bundle" in script
    assert script.index('[[ -n "$bundle_file_list" ]]') < script.index(
        "git diff --quiet"
    )
    assert script.index("git diff --quiet") < script.index("exit 1")


def test_staging_deploy_selects_components_and_orders_backend_first() -> None:
    workflow = load_staging_deploy_workflow()
    job = workflow["jobs"]["deploy"]
    steps = job["steps"]
    steps_by_name = {step["name"]: step for step in steps}
    names = [step["name"] for step in steps]

    assert job["env"]["DEPLOY_COMPONENT"] == (
        "${{ github.event_name == 'push' && 'both' || inputs.component }}"
    )
    backend_condition = (
        "env.DEPLOY_COMPONENT == 'backend' || env.DEPLOY_COMPONENT == 'both'"
    )
    frontend_condition = (
        "env.DEPLOY_COMPONENT == 'frontend' || env.DEPLOY_COMPONENT == 'both'"
    )

    assert steps_by_name["Build and publish backend image"]["if"] == backend_condition
    assert steps_by_name["Deploy and verify backend"]["if"] == backend_condition
    assert steps_by_name["Build frontend assets"]["if"] == frontend_condition
    assert steps_by_name["Upload frontend assets"]["if"] == frontend_condition
    assert names.index("Deploy and verify backend") < names.index(
        "Upload frontend assets"
    )


def test_backend_publication_is_immutable_arm64_and_pinned() -> None:
    workflow = load_staging_deploy_workflow()
    steps = workflow["jobs"]["deploy"]["steps"]
    steps_by_name = {step["name"]: step for step in steps}
    qemu = steps_by_name["Set up ARM64 emulation"]
    buildx = steps_by_name["Set up Docker Buildx"]
    publish_script = steps_by_name["Build and publish backend image"]["run"]

    assert qemu["uses"] == (
        "docker/setup-qemu-action@99012661954931238ded8c8b007157a8430204e1"
    )
    assert qemu["with"] == {
        "image": (
            "docker.io/tonistiigi/binfmt@"
            "sha256:400a4873b838d1b89194d982c45e5fb3cda4593fbfd7e08a02e76b03b21166f0"
        ),
        "platforms": "arm64",
    }
    assert buildx["uses"] == (
        "docker/setup-buildx-action@f87e5991a6d7451dcb8d9637bfbc97413f497069"
    )
    assert "aws ecr describe-images" in publish_script
    assert "ImageNotFoundException" in publish_script
    assert "Reusing published backend image" in publish_script
    assert publish_script.index("aws ecr describe-images") < publish_script.index(
        "docker buildx build"
    )
    assert "aws ecr get-login-password" in publish_script
    assert "--platform linux/arm64" in publish_script
    assert "--target production" in publish_script
    assert '"$repository_uri:${GITHUB_SHA}"' in publish_script
    assert "--push" in publish_script
    assert ":latest" not in publish_script


def test_backend_scan_is_gated_before_deployment() -> None:
    workflow = load_staging_deploy_workflow()
    steps = workflow["jobs"]["deploy"]["steps"]
    steps_by_name = {step["name"]: step for step in steps}
    names = [step["name"] for step in steps]
    scan_script = steps_by_name["Resolve and approve backend image"]["run"]

    assert "aws ecr describe-images" in scan_script
    assert "aws ecr batch-get-image" in scan_script
    assert "python3 scripts/staging_image.py arm64-digest" in scan_script
    assert "aws ecr describe-image-scan-findings" in scan_script
    assert "ScanNotFoundException" in scan_script
    assert "aws ecr start-image-scan" in scan_script
    assert "aws ecr wait image-scan-complete" in scan_script
    assert "python3 scripts/staging_image.py review-scan" in scan_script
    assert scan_script.index("aws ecr start-image-scan") < scan_script.index(
        "aws ecr wait image-scan-complete"
    )
    assert "printf 'BACKEND_IMAGE=%s\\n'" in scan_script
    assert '"$repository_uri@$index_digest" >> "$GITHUB_ENV"' in scan_script
    assert names.index("Resolve and approve backend image") < names.index(
        "Deploy and verify backend"
    )


def test_manual_scan_instructions_reuse_existing_findings() -> None:
    playbook = STAGING_PLAYBOOK.read_text()
    scan_section = playbook[playbook.index('arm64_digest="$(printf'):]

    assert "aws ecr describe-image-scan-findings" in scan_section
    assert "ScanNotFoundException" in scan_section
    assert "aws ecr start-image-scan" in scan_section
    assert scan_section.index("ScanNotFoundException") < scan_section.index(
        "aws ecr start-image-scan"
    )
    assert (
        'uv run python scripts/staging_image.py review-scan <"$scan_report" '
        "|| exit 1"
    ) in scan_section


def test_staging_docs_do_not_report_completed_cd_as_pending() -> None:
    current_guidance = STAGING_PLAYBOOK.read_text() + INFRASTRUCTURE_DOC.read_text()

    for stale_statement in (
        "a future GitHub Actions deployment identity",
        "CD is still unimplemented",
        "The first application deployment remains a separate manual gate",
        "The first cloud deployment through this workflow remains pending",
        "automatic deployment on a `staging` push remains disabled",
        "the proven workflow still requires explicit dispatch",
        "manual-only and accepts `backend`, `frontend`, or `both`",
    ):
        assert stale_statement not in current_guidance


def test_backend_deployment_captures_rollback_and_uses_host_guards() -> None:
    workflow = load_staging_deploy_workflow()
    steps = workflow["jobs"]["deploy"]["steps"]
    deploy_script = next(
        step["run"] for step in steps if step["name"] == "Deploy and verify backend"
    )

    assert "python3 scripts/staging_ssm.py" in deploy_script
    assert '--backend-image "$BACKEND_IMAGE"' in deploy_script
    assert "--document-name AWS-RunShellScript" in deploy_script
    assert '--instance-ids "$STAGING_INSTANCE_ID"' in deploy_script
    assert "aws ssm get-command-invocation" in deploy_script
    assert "aws ssm wait command-executed" not in deploy_script
    assert "--timeout-seconds 60" in deploy_script
    assert "poll_deadline=$((SECONDS + 1020))" in deploy_script
    assert 'if (( SECONDS >= poll_deadline )); then' in deploy_script
    assert "while true" in deploy_script
    for terminal_status in (
        "Success",
        "Cancelled",
        "Failed",
        "TimedOut",
        "Undeliverable",
        "Terminated",
    ):
        assert terminal_status in deploy_script
    assert 'if [[ "$previous_backend_image" == "unavailable" ]]' in deploy_script
    assert "Previous backend rollback image" in deploy_script


def test_mutating_stages_refresh_short_lived_credentials() -> None:
    workflow = load_staging_deploy_workflow()
    steps = workflow["jobs"]["deploy"]["steps"]
    steps_by_name = {step["name"]: step for step in steps}
    names = [step["name"] for step in steps]

    for name in (
        "Refresh backend deployment credentials",
        "Refresh frontend deployment credentials",
    ):
        refresh = steps_by_name[name]
        assert refresh["uses"] == (
            "aws-actions/configure-aws-credentials@"
            "e1253824e5c10ff9df46874f81ed3ec929e19cfd"
        )
        assert refresh["with"]["role-duration-seconds"] == "3600"

    assert names.index("Build and publish backend image") < names.index(
        "Refresh backend deployment credentials"
    ) < names.index("Resolve and approve backend image")
    assert names.index("Build frontend assets") < names.index(
        "Refresh frontend deployment credentials"
    ) < names.index("Upload frontend assets")


def test_frontend_release_builds_then_uses_the_version_preserving_uploader() -> None:
    workflow = load_staging_deploy_workflow()
    steps = workflow["jobs"]["deploy"]["steps"]
    steps_by_name = {step["name"]: step for step in steps}
    setup_node = steps_by_name["Set up Node.js"]
    build_script = steps_by_name["Build frontend assets"]["run"]
    upload_script = steps_by_name["Upload frontend assets"]["run"]

    assert setup_node["uses"] == (
        "actions/setup-node@820762786026740c76f36085b0efc47a31fe5020"
    )
    assert setup_node["with"] == {
        "node-version": "24",
        "cache": "npm",
        "cache-dependency-path": "frontend/package-lock.json",
    }
    for command in (
        "npm ci",
        "npm audit --audit-level=high",
        "npm test",
        "npm run lint",
        "npm run format:check",
        "npm run build",
    ):
        assert command in build_script
    assert "npm run deploy:static" in build_script
    assert "--dry-run" in build_script
    assert "npm run deploy:static" in upload_script
    assert "--dry-run" not in upload_script
    assert "s3 sync" not in upload_script
    assert "--delete" not in upload_script
    assert "cloudfront" not in upload_script.lower()


def test_release_verifies_the_public_application_after_deployment() -> None:
    workflow = load_staging_deploy_workflow()
    steps = workflow["jobs"]["deploy"]["steps"]
    verify = next(
        step for step in steps if step["name"] == "Verify public staging application"
    )
    script = verify["run"]

    assert "curl --fail" in script
    assert '${STAGING_BASE_URL}/?release=${GITHUB_SHA}' in script
    assert (
        '${STAGING_BASE_URL}/metrics/sleep_duration?release=${GITHUB_SHA}' in script
    )
    assert '${STAGING_BASE_URL}/api/v1/health/live/' in script
    assert '${STAGING_BASE_URL}/api/v1/health/ready/' in script
    assert 'cmp --silent "$root_shell" "$deep_link_shell"' in script
    assert 'cmp --silent frontend/dist/index.html "$root_shell"' in script
    assert verify.get("if") is None


def test_deployment_targets_are_validated_before_any_mutation() -> None:
    workflow = load_staging_deploy_workflow()
    steps = workflow["jobs"]["deploy"]["steps"]
    names = [step["name"] for step in steps]
    validate_script = next(
        step["run"] for step in steps if step["name"] == "Validate staging targets"
    )

    for expected in (
        "173291122778",
        "syncvitals-staging-github-deploy-role",
        "eu-central-1",
        "syncvitals/staging/backend",
        "i-08fbc9f0c53265b63",
        "syncvitals-staging-frontend-173291122778-eu-central-1-an",
        "https://staging.syncvitals.space",
    ):
        assert expected in validate_script
    assert "aws sts get-caller-identity" in validate_script
    assert names.index("Validate staging targets") < names.index(
        "Build and publish backend image"
    )
    assert names.index("Validate staging targets") < names.index(
        "Upload frontend assets"
    )


def test_all_staging_deploy_shell_steps_parse() -> None:
    workflow = load_staging_deploy_workflow()
    steps = workflow["jobs"]["deploy"]["steps"]

    for step in steps:
        if script := step.get("run"):
            subprocess.run(
                ["bash", "-n"],
                input=script,
                text=True,
                check=True,
            )
