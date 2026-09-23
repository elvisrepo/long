import uuid
from datetime import UTC, datetime

import pytest

from apps.metrics.models import MetricDefinition, MetricEntry
from apps.wearables.serializers import (
    MAX_WEARABLE_UPLOAD_ENTRIES,
    WearableUploadBatchSerializer,
)

pytestmark = pytest.mark.django_db


def test_wearable_upload_batch_accepts_one_normalized_entry():
    connection_id = uuid.uuid4()
    upload_id = uuid.uuid4()
    body_weight = MetricDefinition.objects.get(slug="body_weight")
    serializer = WearableUploadBatchSerializer(
        data={
            "connection_id": str(connection_id),
            "upload_id": str(upload_id),
            "entries": [
                {
                    "metric_definition": "body_weight",
                    "value": 78.4,
                    "recorded_at": "2026-07-27T08:00:00Z",
                    "source": "samsung_health",
                    "external_source_id": (
                        "health_connect:WeightRecord:record-123"
                    ),
                }
            ],
        }
    )

    assert serializer.is_valid(), serializer.errors
    assert serializer.validated_data == {
        "connection_id": connection_id,
        "upload_id": upload_id,
        "entries": [
            {
                "metric_definition": body_weight,
                "value": 78.4,
                "recorded_at": datetime(
                    2026,
                    7,
                    27,
                    8,
                    0,
                    tzinfo=UTC,
                ),
                "source": MetricEntry.Source.SAMSUNG_HEALTH,
                "external_source_id": (
                    "health_connect:WeightRecord:record-123"
                ),
            }
        ],
    }


def test_wearable_upload_batch_requires_entries():
    serializer = WearableUploadBatchSerializer(
        data={
            "connection_id": str(uuid.uuid4()),
            "upload_id": str(uuid.uuid4()),
        }
    )

    assert serializer.is_valid() is False
    assert serializer.errors == {
        "entries": ["This field is required."],
    }


def test_wearable_upload_batch_rejects_empty_entries():
    serializer = WearableUploadBatchSerializer(
        data={
            "connection_id": str(uuid.uuid4()),
            "upload_id": str(uuid.uuid4()),
            "entries": [],
        }
    )

    assert serializer.is_valid() is False
    assert serializer.errors == {
        "entries": {
            "non_field_errors": ["This list may not be empty."],
        }
    }


def test_wearable_upload_batch_rejects_too_many_entries():
    entries = [
        {
            "metric_definition": "body_weight",
            "value": 78.4,
            "recorded_at": "2026-07-27T08:00:00Z",
            "source": "samsung_health",
            "external_source_id": (
                f"health_connect:WeightRecord:record-{index}"
            ),
        }
        for index in range(MAX_WEARABLE_UPLOAD_ENTRIES + 1)
    ]
    serializer = WearableUploadBatchSerializer(
        data={
            "connection_id": str(uuid.uuid4()),
            "upload_id": str(uuid.uuid4()),
            "entries": entries,
        }
    )

    assert serializer.is_valid() is False
    assert serializer.errors == {
        "entries": {
            "non_field_errors": [
                "Ensure this field has no more than 100 elements."
            ],
        }
    }


def test_wearable_upload_batch_rejects_unknown_top_level_field():
    serializer = WearableUploadBatchSerializer(
        data={
            "connection_id": str(uuid.uuid4()),
            "upload_id": str(uuid.uuid4()),
            "entries": [
                {
                    "metric_definition": "body_weight",
                    "value": 78.4,
                    "recorded_at": "2026-07-27T08:00:00Z",
                    "source": "samsung_health",
                    "external_source_id": (
                        "health_connect:WeightRecord:record-unknown-field"
                    ),
                }
            ],
            "cursor": "unexpected",
        }
    )

    assert serializer.is_valid() is False
    assert serializer.errors == {
        "cursor": ["This field is not supported."],
    }


def test_wearable_upload_batch_rejects_unknown_entry_field():
    serializer = WearableUploadBatchSerializer(
        data={
            "connection_id": str(uuid.uuid4()),
            "upload_id": str(uuid.uuid4()),
            "entries": [
                {
                    "metric_definition": "body_weight",
                    "value": 78.4,
                    "unit": "kg",
                    "recorded_at": "2026-07-27T08:00:00Z",
                    "source": "samsung_health",
                    "external_source_id": (
                        "health_connect:WeightRecord:"
                        "record-unknown-entry-field"
                    ),
                }
            ],
        }
    )

    assert serializer.is_valid() is False
    assert serializer.errors == {
        "entries": [
            {
                "unit": ["This field is not supported."],
            }
        ],
    }


def test_wearable_upload_batch_rejects_duplicate_external_source_ids():
    external_source_id = "health_connect:WeightRecord:record-duplicate"
    serializer = WearableUploadBatchSerializer(
        data={
            "connection_id": str(uuid.uuid4()),
            "upload_id": str(uuid.uuid4()),
            "entries": [
                {
                    "metric_definition": "body_weight",
                    "value": 78.4,
                    "recorded_at": "2026-07-27T08:00:00Z",
                    "source": "samsung_health",
                    "external_source_id": external_source_id,
                },
                {
                    "metric_definition": "body_weight",
                    "value": 78.5,
                    "recorded_at": "2026-07-27T08:01:00Z",
                    "source": "samsung_health",
                    "external_source_id": external_source_id,
                },
            ],
        }
    )

    assert serializer.is_valid() is False
    assert serializer.errors == {
        "entries": [
            "Duplicate external_source_id values are not allowed."
        ],
    }
