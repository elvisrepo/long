"""Build the fixed SSM command used for a guarded staging backend release."""

import argparse
import json
import re
import shlex
from collections.abc import Sequence


STAGING_BACKEND_REPOSITORY = (
    "173291122778.dkr.ecr.eu-central-1.amazonaws.com/syncvitals/staging/backend"
)


def deployment_parameters(*, backend_image: str, region: str) -> dict[str, list[str]]:
    """Return AWS-RunShellScript parameters after validating all substitutions."""

    if not re.fullmatch(
        re.escape(STAGING_BACKEND_REPOSITORY) + r"@sha256:[0-9a-f]{64}",
        backend_image,
    ):
        raise ValueError("backend image is not an immutable staging ECR reference")
    if region != "eu-central-1":
        raise ValueError("staging deployment region must be eu-central-1")

    registry = "173291122778.dkr.ecr.eu-central-1.amazonaws.com"
    script = f"""set -euo pipefail
registry={shlex.quote(registry)}
backend_image={shlex.quote(backend_image)}
exec 9>/run/lock/syncvitals-staging-deploy.lock
if ! flock --nonblock 9; then
  printf 'error: another staging backend deployment is still running\\n' >&2
  exit 1
fi

running_backend_image="$(docker inspect --format '{{{{.Config.Image}}}}' syncvitals-staging-api-1)"
[[ "$running_backend_image" =~ ^173291122778\\.dkr\\.ecr\\.eu-central-1\\.amazonaws\\.com/syncvitals/staging/backend@sha256:[0-9a-f]{{64}}$ ]]
verified_file=/opt/syncvitals/deployment/.verified_backend_image
previous_verified_file=/opt/syncvitals/deployment/.previous_verified_backend_image

write_image_pointer() {{
  local target="$1"
  local image="$2"
  umask 077
  printf '%s\\n' "$image" > "${{target}}.new"
  chmod 0600 "${{target}}.new"
  mv -- "${{target}}.new" "$target"
}}

if [[ ! -f "$verified_file" ]]; then
  write_image_pointer "$verified_file" "$running_backend_image"
fi
verified_backend_image="$(<"$verified_file")"
[[ "$verified_backend_image" =~ ^173291122778\\.dkr\\.ecr\\.eu-central-1\\.amazonaws\\.com/syncvitals/staging/backend@sha256:[0-9a-f]{{64}}$ ]]

if [[ "$backend_image" == "$verified_backend_image" ]]; then
  if [[ -f "$previous_verified_file" ]]; then
    previous_backend_image="$(<"$previous_verified_file")"
    [[ "$previous_backend_image" =~ ^173291122778\\.dkr\\.ecr\\.eu-central-1\\.amazonaws\\.com/syncvitals/staging/backend@sha256:[0-9a-f]{{64}}$ ]]
  else
    previous_backend_image=unavailable
  fi
else
  previous_backend_image="$verified_backend_image"
fi
printf 'previous_backend_image=%s\\n' "$previous_backend_image"

deployment_log="$(mktemp /tmp/syncvitals-staging-deploy.XXXXXX.log)"
cleanup_deployment() {{
  docker logout "$registry" >/dev/null 2>&1 || true
  rm -f -- "$deployment_log"
}}
trap cleanup_deployment EXIT

aws ecr get-login-password --region {shlex.quote(region)} \\
  | docker login --username AWS --password-stdin "$registry"
export BACKEND_IMAGE="$backend_image"
cd /opt/syncvitals/deployment
if ! python3 -m scripts.staging_runtime \\
  --secret-id longevity/staging/backend-runtime \\
  --region {shlex.quote(region)} \\
  -- python3 -m scripts.production_deployment \\
  --compose-file docker-compose.staging.yml \\
  --project-name syncvitals-staging \\
  > "$deployment_log" 2>&1; then
  tail --lines 200 "$deployment_log" >&2
  exit 1
fi

running_backend_image="$(docker inspect --format '{{{{.Config.Image}}}}' syncvitals-staging-api-1)"
test "$running_backend_image" = "$backend_image"
printf 'running_backend_image=%s\\n' "$running_backend_image"
curl --fail --silent --show-error \\
  --header 'Host: staging.syncvitals.space' \\
  --header 'X-Forwarded-Proto: https' \\
  http://127.0.0.1:18000/api/v1/health/live/ >/dev/null
curl --fail --silent --show-error \\
  --header 'Host: staging.syncvitals.space' \\
  --header 'X-Forwarded-Proto: https' \\
  http://127.0.0.1:18000/api/v1/health/ready/ >/dev/null
curl --fail --silent --show-error --retry 5 --retry-delay 2 --retry-all-errors \\
  https://staging.syncvitals.space/api/v1/health/live/ >/dev/null
curl --fail --silent --show-error --retry 5 --retry-delay 2 --retry-all-errors \\
  https://staging.syncvitals.space/api/v1/health/ready/ >/dev/null

if [[ "$backend_image" != "$verified_backend_image" ]]; then
  write_image_pointer "$previous_verified_file" "$verified_backend_image"
  write_image_pointer "$verified_file" "$backend_image"
fi
"""
    command = f"bash -c {shlex.quote(script)}"
    return {
        "commands": [command],
        "executionTimeout": ["900"],
    }


def main(argv: Sequence[str] | None = None) -> int:
    """Write AWS CLI-compatible SSM parameters as JSON."""

    parser = argparse.ArgumentParser()
    parser.add_argument("--backend-image", required=True)
    parser.add_argument("--region", required=True)
    arguments = parser.parse_args(list(argv) if argv is not None else None)
    try:
        parameters = deployment_parameters(
            backend_image=arguments.backend_image,
            region=arguments.region,
        )
    except ValueError as error:
        parser.error(str(error))
    print(json.dumps(parameters))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
