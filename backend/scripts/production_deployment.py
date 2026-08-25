"""Run the migration-first backend deployment sequence.

The parent Step 7 loader supplies the validated runtime snapshot through this
process's environment. Both Docker Compose calls inherit that same snapshot.
"""

import os
import subprocess


def deploy_backend(*, compose_file: str, project_name: str) -> None:
    """Run migrations, then promote and health-check the API service."""

    # Step 7 starts this process with one validated environment. Freeze it once
    # so migration and API promotion cannot observe different ambient values.
    deployment_environment = os.environ.copy()
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
        env=deployment_environment,
    )
    subprocess.run(
        [*compose_command, "up", "--detach", "--wait", "api"],
        check=True,
        env=deployment_environment,
    )
