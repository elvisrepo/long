from datetime import UTC, datetime

import pytest

from apps.metrics.models import MetricDefinition, MetricEntry
from apps.wearables.serializers import WearableUploadEntrySerializer

pytestmark = pytest.mark.django_db


def test_wearable_upload_entry_accepts_normalized_body_weight():
    body_weight = MetricDefinition.objects.get(slug="body_weight")
    serializer = WearableUploadEntrySerializer(
        data={
            "metric_definition": "body_weight",
            "value": 78.4,
            "recorded_at": "2026-07-27T08:00:00Z",
            "source": "samsung_health",
            "external_source_id": (
                "health_connect:WeightRecord:record-123"
            ),
        }
    )

    assert serializer.is_valid(), serializer.errors
    assert serializer.validated_data == {
        "metric_definition": body_weight,
        "value": 78.4,
        "recorded_at": datetime(2026, 7, 27, 8, 0, tzinfo=UTC),
        "source": MetricEntry.Source.SAMSUNG_HEALTH,
        "external_source_id": "health_connect:WeightRecord:record-123",
    }


def test_wearable_upload_entry_rejects_blank_external_source_id():
    serializer = WearableUploadEntrySerializer(
        data={
            "metric_definition": "body_weight",
            "value": 78.4,
            "recorded_at": "2026-07-27T08:00:00Z",
            "source": "samsung_health",
            "external_source_id": " ",
        }
    )

    assert serializer.is_valid() is False
    assert serializer.errors == {
        "external_source_id": ["This field may not be blank."],
    }


def test_wearable_upload_entry_rejects_unsupported_source():
    serializer = WearableUploadEntrySerializer(
        data={
            "metric_definition": "body_weight",
            "value": 78.4,
            "recorded_at": "2026-07-27T08:00:00Z",
            "source": "health_connect",
            "external_source_id": (
                "health_connect:WeightRecord:record-unsupported-source"
            ),
        }
    )

    assert serializer.is_valid() is False
    assert serializer.errors == {
        "source": ['"health_connect" is not a valid choice.'],
    }


def test_wearable_upload_entry_rejects_unsupported_metric_definition():
    serializer = WearableUploadEntrySerializer(
        data={
            "metric_definition": "resting_hr",
            "value": 58,
            "recorded_at": "2026-07-27T08:00:00Z",
            "source": "samsung_health",
            "external_source_id": (
                "health_connect:HeartRateRecord:record-unsupported-metric"
            ),
        }
    )

    assert serializer.is_valid() is False
    assert serializer.errors == {
        "metric_definition": [
            "Object with slug=resting_hr does not exist."
        ],
    }


def test_wearable_upload_entry_rejects_inactive_metric_definition():
    MetricDefinition.objects.filter(slug="body_weight").update(
        is_active=False,
    )
    serializer = WearableUploadEntrySerializer(
        data={
            "metric_definition": "body_weight",
            "value": 78.4,
            "recorded_at": "2026-07-27T08:00:00Z",
            "source": "samsung_health",
            "external_source_id": (
                "health_connect:WeightRecord:record-inactive-metric"
            ),
        }
    )

    assert serializer.is_valid() is False
    assert serializer.errors == {
        "metric_definition": [
            "Object with slug=body_weight does not exist."
        ],
    }


def test_wearable_upload_entry_rejects_value_outside_metric_range():
    serializer = WearableUploadEntrySerializer(
        data={
            "metric_definition": "body_weight",
            "value": 401,
            "recorded_at": "2026-07-27T08:00:00Z",
            "source": "samsung_health",
            "external_source_id": (
                "health_connect:WeightRecord:record-out-of-range"
            ),
        }
    )

    assert serializer.is_valid() is False
    assert serializer.errors == {
        "value": ["Value must be between 20.0 and 400.0."],
    }


def test_wearable_upload_entry_rejects_invalid_recorded_at():
    serializer = WearableUploadEntrySerializer(
        data={
            "metric_definition": "body_weight",
            "value": 78.4,
            "recorded_at": "not-a-timestamp",
            "source": "samsung_health",
            "external_source_id": (
                "health_connect:WeightRecord:record-invalid-time"
            ),
        }
    )

    assert serializer.is_valid() is False
    assert set(serializer.errors) == {"recorded_at"}


def test_wearable_upload_entry_requires_external_source_id():
    serializer = WearableUploadEntrySerializer(
        data={
            "metric_definition": "body_weight",
            "value": 78.4,
            "recorded_at": "2026-07-27T08:00:00Z",
            "source": "samsung_health",
        }
    )

    assert serializer.is_valid() is False
    assert serializer.errors == {
        "external_source_id": ["This field is required."],
    }
