"""Tests for staging image manifest selection and scan policy."""

import pytest

from scripts.staging_image import (
    StagingImageError,
    linux_arm64_digest,
    review_scan_findings,
)


def test_scan_gate_rejects_critical_findings() -> None:
    report = {
        "imageScanStatus": {"status": "COMPLETE"},
        "imageScanFindings": {
            "findings": [
                {"name": "CVE-2099-0001", "severity": "CRITICAL"},
            ]
        },
    }

    with pytest.raises(
        StagingImageError,
        match="unapproved CRITICAL finding: CVE-2099-0001",
    ):
        review_scan_findings(report)


def test_scan_gate_rejects_unreviewed_high_findings() -> None:
    report = {
        "imageScanStatus": {"status": "COMPLETE"},
        "imageScanFindings": {
            "findings": [
                {"name": "CVE-2099-0002", "severity": "HIGH"},
            ]
        },
    }

    with pytest.raises(
        StagingImageError,
        match="unapproved HIGH finding: CVE-2099-0002",
    ):
        review_scan_findings(report)


def test_scan_gate_accepts_only_the_documented_staging_high() -> None:
    report = {
        "imageScanStatus": {"status": "COMPLETE"},
        "imageScanFindings": {
            "findings": [
                {"name": "CVE-2026-85091", "severity": "HIGH"},
                {"name": "CVE-2099-0003", "severity": "MEDIUM"},
            ]
        },
    }

    review_scan_findings(report)


def test_selects_the_single_linux_arm64_manifest() -> None:
    index = {
        "manifests": [
            {
                "digest": "sha256:" + "a" * 64,
                "platform": {"architecture": "arm64", "os": "linux"},
            },
            {
                "digest": "sha256:" + "b" * 64,
                "platform": {"architecture": "unknown", "os": "unknown"},
            },
        ]
    }

    assert linux_arm64_digest(index) == "sha256:" + "a" * 64
