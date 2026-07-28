import uuid
from typing import Any, cast

import pytest

from apps.wearables.payload_hashing import calculate_wearable_payload_hash
from apps.wearables.serializers import WearableUploadBatchSerializer

pytestmark = pytest.mark.django_db


def _validated_entries(
    entries: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    serializer = WearableUploadBatchSerializer(
        data={
            "connection_id": str(uuid.uuid4()),
            "upload_id": str(uuid.uuid4()),
            "entries": entries,
        }
    )
    assert serializer.is_valid(), serializer.errors
    return cast(list[dict[str, Any]], serializer.validated_data["entries"])


def test_payload_hash_is_independent_of_entry_order():
    first_entry = {
        "metric_definition": "body_weight",
        "value": 78.4,
        "recorded_at": "2026-07-27T08:00:00Z",
        "source": "samsung_health",
        "external_source_id": "health_connect:WeightRecord:record-123",
    }
    second_entry = {
        "metric_definition": "body_weight",
        "value": 78.6,
        "recorded_at": "2026-07-28T08:00:00Z",
        "source": "samsung_health",
        "external_source_id": "health_connect:WeightRecord:record-456",
    }

    first_hash = calculate_wearable_payload_hash(
        _validated_entries([first_entry, second_entry])
    )
    reordered_hash = calculate_wearable_payload_hash(
        _validated_entries([second_entry, first_entry])
    )

    assert first_hash == reordered_hash
    assert len(first_hash) == 64
    assert set(first_hash) <= set("0123456789abcdef")


def test_payload_hash_changes_when_entry_value_changes():
    original_entry = {
        "metric_definition": "body_weight",
        "value": 78.4,
        "recorded_at": "2026-07-27T08:00:00Z",
        "source": "samsung_health",
        "external_source_id": "health_connect:WeightRecord:record-123",
    }
    corrected_entry = {
        **original_entry,
        "value": 78.5,
    }

    original_hash = calculate_wearable_payload_hash(
        _validated_entries([original_entry])
    )
    corrected_hash = calculate_wearable_payload_hash(
        _validated_entries([corrected_entry])
    )

    assert corrected_hash != original_hash


def test_payload_hash_changes_when_entry_is_added():
    first_entry = {
        "metric_definition": "body_weight",
        "value": 78.4,
        "recorded_at": "2026-07-27T08:00:00Z",
        "source": "samsung_health",
        "external_source_id": "health_connect:WeightRecord:record-123",
    }
    second_entry = {
        "metric_definition": "body_weight",
        "value": 78.6,
        "recorded_at": "2026-07-28T08:00:00Z",
        "source": "samsung_health",
        "external_source_id": "health_connect:WeightRecord:record-456",
    }

    one_entry_hash = calculate_wearable_payload_hash(
        _validated_entries([first_entry])
    )
    two_entry_hash = calculate_wearable_payload_hash(
        _validated_entries([first_entry, second_entry])
    )

    assert two_entry_hash != one_entry_hash


def test_payload_hash_normalizes_equivalent_timestamps_to_utc():
    utc_entry = {
        "metric_definition": "body_weight",
        "value": 78.4,
        "recorded_at": "2026-07-27T08:00:00Z",
        "source": "samsung_health",
        "external_source_id": "health_connect:WeightRecord:record-123",
    }
    offset_entry = {
        **utc_entry,
        "recorded_at": "2026-07-27T10:00:00+02:00",
    }

    utc_hash = calculate_wearable_payload_hash(
        _validated_entries([utc_entry])
    )
    offset_hash = calculate_wearable_payload_hash(
        _validated_entries([offset_entry])
    )

    assert offset_hash == utc_hash
