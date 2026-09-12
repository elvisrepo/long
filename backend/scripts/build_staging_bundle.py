"""Package only the source files needed on the staging deployment host."""

import argparse
import hashlib
from pathlib import Path
import tarfile


BACKEND = Path(__file__).resolve().parents[1]
BUNDLE_FILES = (
    "runtime_contract.py",
    "docker-compose.staging.yml",
    "scripts/__init__.py",
    "scripts/staging_runtime.py",
    "scripts/production_deployment.py",
    "scripts/staging_storage.py",
    "deploy/docker.service.d/10-staging-storage.conf",
)


def build_bundle(output: Path) -> None:
    """Create a new archive without overwriting an existing bundle."""

    with tarfile.open(output, "x:gz") as archive:
        for name in BUNDLE_FILES:
            archive.add(BACKEND / name, arcname=name, recursive=False)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, required=True)
    arguments = parser.parse_args()
    try:
        build_bundle(arguments.output)
    except OSError, tarfile.TarError:
        parser.exit(1, "error: unable to create a new staging bundle\n")
    with arguments.output.open("rb") as archive:
        digest = hashlib.file_digest(archive, "sha256").hexdigest()
    print(f"{digest}  {arguments.output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
