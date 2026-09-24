"""Select and review immutable staging backend image metadata."""

import argparse
import json
import re
import sys
from collections.abc import Mapping, Sequence


ACCEPTED_STAGING_HIGH_FINDINGS = frozenset({"CVE-2026-85091"})


class StagingImageError(ValueError):
    """Report an image that is unsafe or structurally invalid for staging."""


def linux_arm64_digest(index: Mapping[str, object]) -> str:
    """Return the single valid Linux/ARM64 child digest from an OCI index."""

    manifests = index.get("manifests")
    if not isinstance(manifests, list):
        raise StagingImageError("OCI image index is missing manifests")

    matches: list[str] = []
    for manifest in manifests:
        if not isinstance(manifest, Mapping):
            raise StagingImageError("OCI image manifest entry is invalid")
        platform = manifest.get("platform")
        digest = manifest.get("digest")
        if (
            isinstance(platform, Mapping)
            and platform.get("architecture") == "arm64"
            and platform.get("os") == "linux"
        ):
            if not isinstance(digest, str) or not re.fullmatch(
                r"sha256:[0-9a-f]{64}", digest
            ):
                raise StagingImageError("Linux/ARM64 image digest is invalid")
            matches.append(digest)

    if len(matches) != 1:
        raise StagingImageError("expected exactly one Linux/ARM64 image manifest")
    return matches[0]


def review_scan_findings(report: Mapping[str, object]) -> None:
    """Reject incomplete scans and unapproved severe findings."""

    status = report.get("imageScanStatus")
    if not isinstance(status, Mapping) or status.get("status") != "COMPLETE":
        raise StagingImageError("image vulnerability scan is not complete")

    scan_findings = report.get("imageScanFindings")
    if not isinstance(scan_findings, Mapping):
        raise StagingImageError("image vulnerability report is missing findings")
    findings = scan_findings.get("findings")
    if not isinstance(findings, list):
        raise StagingImageError("image vulnerability findings must be a list")

    for finding in findings:
        if not isinstance(finding, Mapping):
            raise StagingImageError("image vulnerability finding is invalid")
        name = finding.get("name")
        severity = finding.get("severity")
        if severity == "CRITICAL" or (
            severity == "HIGH" and name not in ACCEPTED_STAGING_HIGH_FINDINGS
        ):
            raise StagingImageError(f"unapproved {severity} finding: {name}")


def main(argv: Sequence[str] | None = None) -> int:
    """Read one AWS JSON document and perform the requested image check."""

    parser = argparse.ArgumentParser()
    parser.add_argument("command", choices=("arm64-digest", "review-scan"))
    arguments = parser.parse_args(list(argv) if argv is not None else None)

    try:
        payload: object = json.load(sys.stdin)
        if not isinstance(payload, Mapping):
            raise StagingImageError("AWS image response must be a JSON object")
        if arguments.command == "arm64-digest":
            print(linux_arm64_digest(payload))
        else:
            review_scan_findings(payload)
            print("Backend image scan passed the staging policy.")
    except (json.JSONDecodeError, StagingImageError) as error:
        print(f"error: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
