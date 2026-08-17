"""Deterministic hashing for validated wearable upload payloads."""

import hashlib
import json
from collections.abc import Mapping, Sequence
from datetime import UTC, datetime
from typing import Any, cast

from apps.metrics.models import MetricDefinition


PAYLOAD_HASH_SCHEMA_VERSION = 1


def calculate_wearable_payload_hash(
    entries: Sequence[Mapping[str, Any]],
) -> str:
    """Return an order-independent SHA-256 hash of normalized entries."""
    canonical_entries: list[dict[str, Any]] = []

    for entry in sorted(
        entries,
        key=lambda item: cast(str, item["external_source_id"]),
    ):
        definition = cast(MetricDefinition, entry["metric_definition"])
        recorded_at = cast(datetime, entry["recorded_at"]).astimezone(UTC)
        period_start = cast(datetime | None, entry.get("period_start"))

        canonical_entry = {
            "external_source_id": cast(
                str,
                entry["external_source_id"],
            ),
            "metric_definition": definition.slug,
            "recorded_at": recorded_at.isoformat(
                timespec="microseconds",
            ).replace("+00:00", "Z"),
            "source": str(entry["source"]),
            "value": cast(float, entry["value"]),
        }
        # Keep the canonical form of existing instantaneous Weight payloads
        # unchanged so a retry spanning this deployment still matches.
        if period_start is not None:
            canonical_entry["period_start"] = period_start.astimezone(
                UTC
            ).isoformat(timespec="microseconds").replace("+00:00", "Z")
        canonical_entries.append(canonical_entry)

    canonical_payload = {
        "schema_version": PAYLOAD_HASH_SCHEMA_VERSION,
        "entries": canonical_entries,
    }
    serialized_payload = json.dumps(
        canonical_payload,
        ensure_ascii=True,
        allow_nan=False,
        sort_keys=True,
        separators=(",", ":"),
    )

    return hashlib.sha256(serialized_payload.encode("utf-8")).hexdigest()
