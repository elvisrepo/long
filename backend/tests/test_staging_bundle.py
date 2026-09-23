"""Prove that the allowlisted host bundle runs without the application tree."""

import ast
import os
from pathlib import Path
import subprocess
import sys
import tarfile


def test_bundle_contains_only_required_files_and_loader_runs_without_site_packages(
    tmp_path: Path,
) -> None:
    from scripts.build_staging_bundle import build_bundle

    archive = tmp_path / "deployment.tar.gz"
    build_bundle(archive)
    extracted = tmp_path / "deployment"
    with tarfile.open(archive) as bundle:
        assert set(bundle.getnames()) == {
            "runtime_contract.py",
            "docker-compose.staging.yml",
            "scripts/__init__.py",
            "scripts/staging_runtime.py",
            "scripts/production_deployment.py",
            "scripts/staging_db_restore_check.py",
            "scripts/staging_storage.py",
            "deploy/docker.service.d/10-staging-storage.conf",
            "deploy/systemd/syncvitals-staging-db-restore-check.service",
            "deploy/systemd/syncvitals-staging-db-restore-check.timer",
            "deploy/systemd/syncvitals-staging-db-restore-freshness.service",
            "deploy/systemd/syncvitals-staging-db-restore-freshness.timer",
        }
        bundle.extractall(extracted, filter="data")

    for source in extracted.rglob("*.py"):
        ast.parse(source.read_text(), filename=str(source), feature_version=(3, 12))

    for module in ("scripts.staging_runtime", "scripts.production_deployment"):
        result = subprocess.run(
            [sys.executable, "-S", "-m", module, "--help"],
            cwd=extracted,
            env={"PATH": os.environ["PATH"]},
            capture_output=True,
            text=True,
        )
        assert result.returncode == 0, result.stderr
