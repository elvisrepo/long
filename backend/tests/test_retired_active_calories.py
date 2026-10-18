import pytest
from rest_framework.test import APIClient

from apps.metrics.models import MetricDefinition, MetricEntry
from apps.users.models import User
from apps.wearables.serializers import WearableUploadEntrySerializer

pytestmark = pytest.mark.django_db


def test_active_calories_are_retired_without_deleting_imported_history() -> None:
    user = User.objects.create_user(email="retired-energy@example.com", password="test")
    metric = MetricDefinition.objects.get(user=None, slug="active_calories_burned")
    entry = MetricEntry.objects.create(
        user=user, metric_definition=metric, value=100,
        recorded_at="2026-10-16T10:00:00Z", source="health_connect",
    )
    client = APIClient()
    client.force_authenticate(user)
    definitions = client.get("/api/v1/metrics/definitions/").data
    slugs = {row["slug"] for row in definitions}
    assert "active_calories_burned" not in slugs
    assert {"distance", "total_calories_burned"} <= slugs
    assert client.get("/api/v1/metrics/entries/").data == []
    assert MetricEntry.objects.filter(pk=entry.pk).exists()
    serializer = WearableUploadEntrySerializer(data={
        "metric_definition": "active_calories_burned", "value": 100,
        "period_start": "2026-10-16T09:45:00Z", "recorded_at": "2026-10-16T10:00:00Z",
        "source": "fitbit", "external_source_id": "old-active-record",
    })
    assert not serializer.is_valid()
    assert "metric_definition" in serializer.errors
