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
                {
                    "name": "CVE-2026-85091",
                    "severity": "HIGH",
                    "attributes": [
                        {"key": "package_name", "value": "zlib"},
                        {
                            "key": "package_version",
                            "value": "1.3.dfsg+really1.3.1-1",
                        },
                    ],
                },
                {
                    "name": "CVE-2026-82560",
                    "severity": "HIGH",
                    "attributes": [
                        {"key": "package_name", "value": "perl"},
                        {
                            "key": "package_version",
                            "value": "5.40.1-6+deb13u1",
                        },
                    ],
                },
                {"name": "CVE-2099-0003", "severity": "MEDIUM"},
            ]
        },
    }

    review_scan_findings(report)


def test_scan_gate_accepts_reported_gcc_findings_for_exact_package_version() -> None:
    report = {
        "imageScanStatus": {"status": "COMPLETE"},
        "imageScanFindings": {
            "findings": [
                {
                    "name": cve,
                    "severity": "HIGH",
                    "attributes": [
                        {"key": "package_name", "value": "gcc-14"},
                        {"key": "package_version", "value": "14.2.0-19"},
                    ],
                }
                for cve in ("CVE-2026-102010", "CVE-2026-95619")
            ]
        },
    }

    review_scan_findings(report)


def test_scan_gate_rejects_allowlisted_cve_for_an_unreviewed_package_version() -> None:
    report = {
        "imageScanStatus": {"status": "COMPLETE"},
        "imageScanFindings": {
            "findings": [
                {
                    "name": "CVE-2026-82560",
                    "severity": "HIGH",
                    "attributes": [
                        {"key": "package_name", "value": "perl"},
                        {"key": "package_version", "value": "5.40.1-6+deb13u2"},
                    ],
                }
            ]
        },
    }

    with pytest.raises(
        StagingImageError,
        match="unapproved HIGH finding: CVE-2026-82560",
    ):
        review_scan_findings(report)


def test_scan_gate_rejects_gcc_finding_for_an_unreviewed_package_version() -> None:
    report = {
        "imageScanStatus": {"status": "COMPLETE"},
        "imageScanFindings": {
            "findings": [
                {
                    "name": "CVE-2026-102010",
                    "severity": "HIGH",
                    "attributes": [
                        {"key": "package_name", "value": "gcc-14"},
                        {"key": "package_version", "value": "14.2.0-20"},
                    ],
                }
            ]
        },
    }

    with pytest.raises(
        StagingImageError,
        match="unapproved HIGH finding: CVE-2026-102010",
    ):
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
