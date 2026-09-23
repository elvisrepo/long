from datetime import UTC, datetime

import pytest
from django.db.models.deletion import RestrictedError

from apps.metrics.models import MetricDefinition, MetricEntry
from apps.users.models import User
from apps.wearables.models import WearableConnection

pytestmark = pytest.mark.django_db


def test_metric_entry_references_wearable_connection():
    user = User.objects.create_user(
        email="metric-entry-connection@example.com",
        password="strong-password-123",
    )
    connection = WearableConnection.objects.create(
        user=user,
        provider=WearableConnection.Provider.HEALTH_CONNECT,
    )
    body_weight = MetricDefinition.objects.get(slug="body_weight")

    entry = MetricEntry.objects.create(
        user=user,
        metric_definition=body_weight,
        value=78.4,
        recorded_at=datetime(2026, 7, 27, 8, 0, tzinfo=UTC),
        source=MetricEntry.Source.SAMSUNG_HEALTH,
        source_connection=connection,
        external_source_id="health_connect:WeightRecord:record-123",
    )

    assert entry.source_connection == connection
    assert entry.source_connection_id == connection.id


def test_deleting_metric_entry_preserves_wearable_connection():
    user = User.objects.create_user(
        email="delete-metric-entry@example.com",
        password="strong-password-123",
    )
    connection = WearableConnection.objects.create(
        user=user,
        provider=WearableConnection.Provider.HEALTH_CONNECT,
    )
    entry = MetricEntry.objects.create(
        user=user,
        metric_definition=MetricDefinition.objects.get(slug="body_weight"),
        value=78.4,
        recorded_at=datetime(2026, 7, 27, 8, 0, tzinfo=UTC),
        source=MetricEntry.Source.SAMSUNG_HEALTH,
        source_connection=connection,
        external_source_id="health_connect:WeightRecord:record-delete-entry",
    )

    entry.delete()

    assert WearableConnection.objects.filter(id=connection.id).exists()


def test_hard_deleting_referenced_wearable_connection_is_restricted():
    user = User.objects.create_user(
        email="restrict-connection-delete@example.com",
        password="strong-password-123",
    )
    connection = WearableConnection.objects.create(
        user=user,
        provider=WearableConnection.Provider.HEALTH_CONNECT,
    )
    entry = MetricEntry.objects.create(
        user=user,
        metric_definition=MetricDefinition.objects.get(slug="body_weight"),
        value=78.4,
        recorded_at=datetime(2026, 7, 27, 8, 0, tzinfo=UTC),
        source=MetricEntry.Source.SAMSUNG_HEALTH,
        source_connection=connection,
        external_source_id="health_connect:WeightRecord:record-restrict",
    )

    with pytest.raises(RestrictedError):
        connection.delete()

    assert WearableConnection.objects.filter(id=connection.id).exists()
    assert MetricEntry.objects.filter(id=entry.id).exists()


def test_deleting_user_cascades_connection_and_metric_entry_together():
    user = User.objects.create_user(
        email="delete-wearable-user@example.com",
        password="strong-password-123",
    )
    connection = WearableConnection.objects.create(
        user=user,
        provider=WearableConnection.Provider.HEALTH_CONNECT,
    )
    entry = MetricEntry.objects.create(
        user=user,
        metric_definition=MetricDefinition.objects.get(slug="body_weight"),
        value=78.4,
        recorded_at=datetime(2026, 7, 27, 8, 0, tzinfo=UTC),
        source=MetricEntry.Source.SAMSUNG_HEALTH,
        source_connection=connection,
        external_source_id="health_connect:WeightRecord:record-user-delete",
    )
    user_id = user.id
    connection_id = connection.id
    entry_id = entry.id

    user.delete()

    assert User.objects.filter(id=user_id).exists() is False
    assert WearableConnection.objects.filter(id=connection_id).exists() is False
    assert MetricEntry.objects.filter(id=entry_id).exists() is False
