from datetime import UTC, datetime
import uuid

import pytest
from rest_framework.test import APIClient
from rest_framework.response import Response

from apps.metrics.models import MetricDefinition, MetricEntry
from apps.users.models import User
from apps.wearables.models import WearableConnection
from apps.metrics.analytics import get_consistency_analytics
from django.utils import timezone
from datetime import timedelta

pytestmark = pytest.mark.django_db


def test_distance_uses_platform_total_instead_of_alphabetical_raw_origin() -> None:
    user = User.objects.create_user(email="aggregate@example.com", password="test")
    metric = MetricDefinition.objects.get(user=None, slug="distance")
    # Raw records are retained, but neither app's total is authoritative.
    for package, value in (("com.a.phone", 2), ("com.z.watch", 5)):
        MetricEntry.objects.create(
            user=user,
            metric_definition=metric,
            value=value,
            recorded_at=datetime(2026, 10, 15, 21, 50, tzinfo=UTC),
            source="health_connect",
            context={"source_package_name": package},
        )
    # Health Connect combined these sources into 5.5km. This bucket ends at
    # local midnight and belongs to October 15, rather than October 16.
    snapshot = MetricEntry.objects.create(
        user=user,
        metric_definition=metric,
        value=5.5,
        period_start=datetime(2026, 10, 15, 21, 45, tzinfo=UTC),
        recorded_at=datetime(2026, 10, 15, 22, tzinfo=UTC),
        source="health_connect",
        context={"aggregation": "health_connect", "has_data": True},
    )
    client = APIClient()
    client.force_authenticate(user)
    response = client.get(
        "/api/v1/metrics/entries/daily-distance/"
        "?timezone=Europe/Tirane&from=2026-10-15&to=2026-10-15"
    )
    assert response.status_code == 200
    assert [(row["local_date"], row["value"]) for row in response.data] == [
        ("2026-10-15", 5.5),
    ]
    assert response.data[0]["context"]["aggregation"] == "health_connect_daily"
    history = client.get("/api/v1/metrics/entries/?metric=distance").data
    assert len(history) == 2
    assert snapshot.id not in {row["id"] for row in history}


def test_platform_snapshot_upload_replay_correction_and_removed_data() -> None:
    user = User.objects.create_user(email="snapshot@example.com", password="test")
    connection = WearableConnection.objects.create(user=user, provider="health_connect")
    client = APIClient()
    client.force_authenticate(user)
    entry = {
        "metric_definition": "distance",
        "value": 5.5,
        "period_start": "2026-10-15T21:45:00Z",
        "recorded_at": "2026-10-15T22:00:00Z",
        "source_record_modified_at": "2026-10-16T08:00:00Z",
        "source": "health_connect",
        "aggregation": "health_connect",
        "has_data": True,
        "external_source_id": "health_connect:aggregate:distance:2026-10-15T21:45:00Z",
    }

    def upload() -> Response:
        return client.post(
            "/api/v1/wearables/uploads/",
            {
                "connection_id": str(connection.id),
                "upload_id": str(uuid.uuid4()),
                "entries": [entry],
            },
            format="json",
        )

    first = upload()
    assert first.status_code == 201, first.data
    assert upload().data["entries_skipped"] == 1
    entry.update(value=6, source_record_modified_at="2026-10-16T09:00:00Z")
    assert upload().data["entries_updated"] == 1
    entry.update(
        value=0, has_data=False, source_record_modified_at="2026-10-16T10:00:00Z"
    )
    assert upload().data["entries_updated"] == 1
    stored = MetricEntry.objects.get(user=user)
    assert stored.context == {"aggregation": "health_connect", "has_data": False}
    response = client.get(
        "/api/v1/metrics/entries/daily-distance/?timezone=Europe/Tirane"
    )
    assert response.data == []


def test_empty_snapshots_do_not_create_tracked_days_and_midnight_closes_previous_day() -> (
    None
):
    user = User.objects.create_user(email="empty-snapshot@example.com", password="test")
    metric = MetricDefinition.objects.get(user=None, slug="total_calories_burned")
    midnight = timezone.now().replace(hour=0, minute=0, second=0, microsecond=0)
    for end, value, present in ((midnight, 50, True), (timezone.now(), 0, False)):
        MetricEntry.objects.create(
            user=user,
            metric_definition=metric,
            value=value,
            period_start=end - timedelta(minutes=15),
            recorded_at=end,
            source="health_connect",
            context={"aggregation": "health_connect", "has_data": present},
        )
    result = get_consistency_analytics(user=user)
    total = next(
        metric
        for metric in result["metrics"]
        if metric["slug"] == "total_calories_burned"
    )
    assert total["tracked_days"] == 1
    assert total["day_presence"][-2:] == [True, False]


@pytest.mark.parametrize(
    "field,value",
    [
        ("period_start", "2026-10-15T21:46:00Z"),
        ("recorded_at", "2026-10-15T22:01:00Z"),
        ("source_record_modified_at", None),
        ("external_source_id", "arbitrary-id"),
        ("source_package_name", "com.fake.writer"),
    ],
)
def test_snapshot_boundary_rejects_invalid_identity_and_time_fields(
    field: str, value: object
) -> None:
    from apps.wearables.serializers import WearableUploadEntrySerializer

    entry = {
        "metric_definition": "total_calories_burned",
        "value": 25,
        "period_start": "2026-10-15T21:45:00Z",
        "recorded_at": "2026-10-15T22:00:00Z",
        "source_record_modified_at": "2026-10-16T08:00:00Z",
        "source": "health_connect",
        "aggregation": "health_connect",
        "has_data": True,
        "external_source_id": "health_connect:aggregate:total_calories_burned:2026-10-15T21:45:00Z",
    }
    entry[field] = value
    serializer = WearableUploadEntrySerializer(data=entry)
    assert not serializer.is_valid()
    assert field in serializer.errors or "period_start" in serializer.errors
