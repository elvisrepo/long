from datetime import UTC, datetime

import pytest
from django.db import IntegrityError, transaction

from apps.metrics.models import MetricDefinition, MetricEntry
from apps.users.models import User
from apps.wearables.models import WearableConnection

pytestmark = pytest.mark.django_db


def test_duplicate_external_record_for_same_connection_is_rejected():
    user = User.objects.create_user(
        email="duplicate-wearable-record@example.com",
        password="strong-password-123",
    )
    connection = WearableConnection.objects.create(
        user=user,
        provider=WearableConnection.Provider.HEALTH_CONNECT,
    )
    body_weight = MetricDefinition.objects.get(slug="body_weight")
    external_source_id = "health_connect:WeightRecord:record-123"

    MetricEntry.objects.create(
        user=user,
        metric_definition=body_weight,
        value=78.4,
        recorded_at=datetime(2026, 7, 27, 8, 0, tzinfo=UTC),
        source=MetricEntry.Source.SAMSUNG_HEALTH,
        source_connection=connection,
        external_source_id=external_source_id,
    )

    with pytest.raises(IntegrityError):
        with transaction.atomic():
            MetricEntry.objects.create(
                user=user,
                metric_definition=body_weight,
                value=78.5,
                recorded_at=datetime(2026, 7, 27, 8, 1, tzinfo=UTC),
                source=MetricEntry.Source.SAMSUNG_HEALTH,
                source_connection=connection,
                external_source_id=external_source_id,
            )

    assert MetricEntry.objects.filter(
        source_connection=connection,
        external_source_id=external_source_id,
    ).count() == 1


def test_same_external_record_id_is_allowed_for_different_connections():
    first_user = User.objects.create_user(
        email="first-external-record-owner@example.com",
        password="strong-password-123",
    )
    second_user = User.objects.create_user(
        email="second-external-record-owner@example.com",
        password="strong-password-123",
    )
    first_connection = WearableConnection.objects.create(
        user=first_user,
        provider=WearableConnection.Provider.HEALTH_CONNECT,
    )
    second_connection = WearableConnection.objects.create(
        user=second_user,
        provider=WearableConnection.Provider.HEALTH_CONNECT,
    )
    body_weight = MetricDefinition.objects.get(slug="body_weight")
    external_source_id = "health_connect:WeightRecord:shared-record-id"

    MetricEntry.objects.create(
        user=first_user,
        metric_definition=body_weight,
        value=78.4,
        recorded_at=datetime(2026, 7, 27, 8, 0, tzinfo=UTC),
        source=MetricEntry.Source.SAMSUNG_HEALTH,
        source_connection=first_connection,
        external_source_id=external_source_id,
    )
    MetricEntry.objects.create(
        user=second_user,
        metric_definition=body_weight,
        value=65.2,
        recorded_at=datetime(2026, 7, 27, 8, 0, tzinfo=UTC),
        source=MetricEntry.Source.SAMSUNG_HEALTH,
        source_connection=second_connection,
        external_source_id=external_source_id,
    )

    assert MetricEntry.objects.filter(
        external_source_id=external_source_id,
    ).count() == 2


def test_manual_entries_without_external_record_id_are_not_deduplicated():
    user = User.objects.create_user(
        email="manual-entry-deduplication@example.com",
        password="strong-password-123",
    )
    body_weight = MetricDefinition.objects.get(slug="body_weight")
    recorded_at = datetime(2026, 7, 27, 8, 0, tzinfo=UTC)

    MetricEntry.objects.create(
        user=user,
        metric_definition=body_weight,
        value=78.4,
        recorded_at=recorded_at,
    )
    MetricEntry.objects.create(
        user=user,
        metric_definition=body_weight,
        value=78.4,
        recorded_at=recorded_at,
    )

    assert MetricEntry.objects.filter(
        user=user,
        source_connection__isnull=True,
        external_source_id__isnull=True,
    ).count() == 2
