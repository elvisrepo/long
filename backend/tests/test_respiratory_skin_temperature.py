import pytest
import uuid
from rest_framework.test import APIClient
from rest_framework.response import Response
from apps.metrics.models import MetricDefinition, MetricEntry
from apps.users.models import User
from apps.wearables.models import WearableConnection

pytestmark = pytest.mark.django_db


@pytest.mark.parametrize(
    "slug,name,unit,minimum,maximum",
    [
        ("respiratory_rate", "Respiratory Rate", "breaths/min", 0, 1000),
        ("skin_temperature", "Skin Temperature Change", "°C", -30, 30),
    ],
)
def test_vital_metric_definitions(
    slug: str, name: str, unit: str, minimum: float, maximum: float
) -> None:
    definition = MetricDefinition.objects.get(user=None, slug=slug)
    assert definition.is_default and definition.is_active
    assert (
        definition.name,
        definition.unit,
        definition.min_value,
        definition.max_value,
    ) == (name, unit, minimum, maximum)


@pytest.mark.parametrize(
    "slug,value", [("respiratory_rate", 16.5), ("skin_temperature", -0.3)]
)
def test_vitals_upload_any_writer_retry_and_correction(slug: str, value: float) -> None:
    user = User.objects.create_user(email="vitals@example.com", password="test")
    connection = WearableConnection.objects.create(user=user, provider="health_connect")
    client = APIClient()
    client.force_authenticate(user)
    entry = {
        "metric_definition": slug,
        "value": value,
        "recorded_at": "2026-10-16T08:00:00Z",
        "source": "health_connect",
        "source_package_name": "com.example.health",
        "external_source_id": f"health_connect:{slug}:sample",
        "source_record_modified_at": "2026-10-16T09:00:00Z",
    }

    def upload() -> Response:
        return client.post(
            "/api/v1/wearables/uploads/",
            {
                "connection_id": str(connection.pk),
                "upload_id": str(uuid.uuid4()),
                "entries": [entry],
            },
            format="json",
        )

    response = upload()
    assert response.status_code == 201, response.data
    stored = MetricEntry.objects.get(user=user)
    assert stored.value == value
    assert stored.context == {"source_package_name": "com.example.health"}
    assert upload().data["entries_skipped"] == 1
    entry.update(value=value + 0.1, source_record_modified_at="2026-10-16T10:00:00Z")
    assert upload().data["entries_updated"] == 1


@pytest.mark.parametrize(
    "slug,path,values",
    [
        ("respiratory_rate", "daily-respiratory-rate", [12, 14, 19]),
        ("skin_temperature", "daily-skin-temperature", [-0.5, -0.3, 0.2]),
    ],
)
def test_daily_vitals_are_private_single_source_medians(
    slug: str, path: str, values: list[float]
) -> None:
    user = User.objects.create_user(email="median@example.com", password="test")
    other = User.objects.create_user(email="other-vital@example.com", password="test")
    definition = MetricDefinition.objects.get(user=None, slug=slug)
    client = APIClient()
    client.force_authenticate(user)
    for index, value in enumerate(values):
        MetricEntry.objects.create(
            user=user,
            metric_definition=definition,
            value=value,
            recorded_at=f"2026-10-16T0{index}:00:00Z",
            source="health_connect",
            context={"source_package_name": "com.example.primary"},
        )
    for owner, source, context in [
        (other, "health_connect", {}),
        (user, "manual", {}),
        (user, "health_connect", {"source_package_name": "com.other.writer"}),
    ]:
        MetricEntry.objects.create(
            user=owner,
            metric_definition=definition,
            value=25,
            recorded_at="2026-10-16T03:00:00Z",
            source=source,
            context=context,
        )
    response = client.get(
        f"/api/v1/metrics/entries/{path}/?timezone=Europe/Tirane&limit=1"
    )
    assert response.status_code == 200
    row = response.json()[0]
    assert row["metric_definition"] == slug
    assert row["value"] == values[1]
    assert row["local_date"] == "2026-10-16"
    assert row["context"]["aggregation"] == "daily_median"
    assert APIClient().get(f"/api/v1/metrics/entries/{path}/").status_code == 401
    assert (
        client.get(f"/api/v1/metrics/entries/{path}/?timezone=invalid").status_code
        == 400
    )
