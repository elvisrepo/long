"""Run the migration-first backend deployment sequence.

The parent Step 7 loader supplies the validated runtime snapshot through this
process's environment. Both Docker Compose calls inherit that same snapshot.
"""

import subprocess


def deploy_backend(*, compose_file: str, project_name: str) -> None:
    """Run migrations, then promote and health-check the API service."""

    compose_command = [
        "docker",
        "compose",
        "--project-name",
        project_name,
        # An explicit empty file disables Compose's implicit developer `.env`.
        "--env-file",
        "/dev/null",
        "--file",
        compose_file,
    ]
    subprocess.run(
        [*compose_command, "run", "--rm", "migration"],
        check=True,
    )
    subprocess.run(
        [*compose_command, "up", "--detach", "--wait", "api"],
        check=True,
    )
