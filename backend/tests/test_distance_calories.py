import uuid
from datetime import UTC, datetime

import pytest
from rest_framework.test import APIClient
from rest_framework.response import Response

from apps.metrics.models import MetricDefinition, MetricEntry
from apps.users.models import User
from apps.wearables.models import WearableConnection

pytestmark = pytest.mark.django_db


def test_distance_and_total_calories_are_shared_system_metrics() -> None:
    for slug, unit in (("distance", "km"), ("total_calories_burned", "kcal")):
        definition = MetricDefinition.objects.get(user=None, slug=slug)
        assert definition.is_default and definition.is_active
        assert definition.unit == unit
        assert definition.min_value == 0


@pytest.fixture
def connected_client() -> tuple[APIClient, User, WearableConnection]:
    user = User.objects.create_user(email="activity@example.com", password="test")
    connection = WearableConnection.objects.create(user=user, provider="health_connect")
    client = APIClient()
    client.force_authenticate(user)
    return client, user, connection


def interval_entry(
    slug: str, *, package: str = "com.example.health"
) -> dict[str, object]:
    return {
        "metric_definition": slug,
        "value": 0.491 if slug == "distance" else 9.3,
        "period_start": "2026-10-16T08:00:00Z",
        "recorded_at": "2026-10-16T08:01:00Z",
        "source": "health_connect",
        "source_package_name": package,
        "external_source_id": f"health_connect:{slug}:sample-1",
        "source_record_modified_at": "2026-10-16T09:00:00Z",
    }


@pytest.mark.parametrize("slug", ["distance", "total_calories_burned"])
def test_upload_preserves_any_health_connect_origin_and_retries_safely(
    connected_client: tuple[APIClient, User, WearableConnection],
    slug: str,
) -> None:
    client, user, connection = connected_client
    entry = interval_entry(slug)

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

    response = upload()
    assert response.status_code == 201, response.data
    stored = MetricEntry.objects.get(user=user)
    assert stored.value == entry["value"]
    assert stored.source == "health_connect"
    assert stored.context == {"source_package_name": "com.example.health"}
    assert stored.period_start.isoformat() == "2026-10-16T08:00:00+00:00"
    assert upload().data["entries_skipped"] == 1
    entry["value"] = 0.5 if slug == "distance" else 10
    entry["source_record_modified_at"] = "2026-10-16T10:00:00Z"
    assert upload().data["entries_updated"] == 1
    stored.refresh_from_db()
    assert stored.value == entry["value"]
    entry["source_package_name"] = "com.other.health"
    entry["source_record_modified_at"] = "2026-10-16T11:00:00Z"
    assert upload().status_code == 409
    stored.refresh_from_db()
    assert stored.context["source_package_name"] == "com.example.health"


@pytest.mark.parametrize(
    "slug,path",
    [
        ("distance", "daily-distance"),
        ("total_calories_burned", "daily-total-calories"),
    ],
)
def test_daily_totals_choose_one_origin_and_keep_raw_intervals(
    connected_client: tuple[APIClient, User, WearableConnection],
    slug: str,
    path: str,
) -> None:
    client, user, _ = connected_client
    definition = MetricDefinition.objects.get(user=None, slug=slug)
    # Different UTC dates belong to the same local date in Europe/Tirane.
    for package, value, timestamp in (
        ("com.a.health", 0.006, "2026-10-15T23:16:00+00:00"),
        ("com.a.health", 0.008, "2026-10-16T08:51:00+00:00"),
        ("com.b.health", 0.034, "2026-10-15T23:16:00+00:00"),
    ):
        MetricEntry.objects.create(
            user=user,
            metric_definition=definition,
            value=value,
            recorded_at=datetime.fromisoformat(timestamp),
            source="health_connect",
            context={"source_package_name": package},
        )
    other = User.objects.create_user(email="other@example.com", password="test")
    MetricEntry.objects.create(
        user=other,
        metric_definition=definition,
        value=100,
        recorded_at=datetime(2026, 10, 16, 8, tzinfo=UTC),
        source="health_connect",
        context={"source_package_name": "com.a.health"},
    )
    custom = MetricDefinition.objects.create(
        user=user,
        slug=slug,
        name="Custom",
        unit="km",
        min_value=0,
        max_value=100,
        category="custom",
    )
    MetricEntry.objects.create(
        user=user,
        metric_definition=custom,
        value=100,
        recorded_at=datetime(2026, 10, 16, 8, tzinfo=UTC),
    )
    MetricEntry.objects.create(
        user=user, metric_definition=definition, value=0.014,
        period_start=datetime(2026, 10, 16, 8, 45, tzinfo=UTC),
        recorded_at=datetime(2026, 10, 16, 9, tzinfo=UTC), source="health_connect",
        context={"aggregation": "health_connect", "has_data": True},
    )
    response = client.get(
        f"/api/v1/metrics/entries/{path}/?timezone=Europe/Tirane"
        "&from=2026-10-16&to=2026-10-16&limit=7"
    )
    assert response.status_code == 200
    assert len(response.data) == 1
    row = response.data[0]
    assert row["metric_definition"] == slug
    assert row["value"] == pytest.approx(0.014)
    assert row["local_date"] == "2026-10-16"
    assert row["context"] == {
        "aggregation": "health_connect_daily",
    }
    assert MetricEntry.objects.count() == 6


@pytest.mark.parametrize("slug", ["distance", "total_calories_burned"])
@pytest.mark.parametrize(
    "field,value",
    [
        ("value", -1),
        ("value", float("inf")),
        ("period_start", None),
        ("period_start", "2026-10-16T08:01:00Z"),
        ("source_package_name", None),
        ("source_package_name", ""),
        ("source_package_name", "not a package"),
    ],
)
def test_activity_upload_rejects_invalid_intervals_values_and_origins(
    connected_client: tuple[APIClient, User, WearableConnection],
    slug: str,
    field: str,
    value: object,
) -> None:
    from apps.wearables.serializers import WearableUploadEntrySerializer

    entry = interval_entry(slug)
    entry[field] = value
    serializer = WearableUploadEntrySerializer(data=entry)
    assert not serializer.is_valid()
    assert field in serializer.errors


def test_upload_id_cannot_be_replayed_with_another_origin(
    connected_client: tuple[APIClient, User, WearableConnection],
) -> None:
    client, _, connection = connected_client
    payload = {
        "connection_id": str(connection.id),
        "upload_id": str(uuid.uuid4()),
        "entries": [interval_entry("distance")],
    }
    assert (
        client.post("/api/v1/wearables/uploads/", payload, format="json").status_code
        == 201
    )
    payload["entries"][0]["source_package_name"] = "com.other.health"
    response = client.post("/api/v1/wearables/uploads/", payload, format="json")
    assert response.status_code == 409
    assert "upload_id" in str(response.data)


@pytest.mark.parametrize("path", ["daily-distance", "daily-total-calories"])
def test_activity_daily_api_requires_authentication_and_valid_filters(
    connected_client: tuple[APIClient, User, WearableConnection],
    path: str,
) -> None:
    url = f"/api/v1/metrics/entries/{path}/"
    assert APIClient().get(url).status_code == 401
    client, _, _ = connected_client
    for query in ("timezone=invalid", "limit=367", "from=invalid"):
        assert client.get(f"{url}?{query}").status_code == 400
