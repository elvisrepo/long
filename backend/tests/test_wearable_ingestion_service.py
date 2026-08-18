import uuid
from typing import Any, cast

import pytest

from apps.metrics.models import MetricDefinition, MetricEntry
from apps.users.models import User
from apps.wearables.models import SyncRun, WearableConnection
from apps.wearables.payload_hashing import calculate_wearable_payload_hash
from apps.wearables.serializers import WearableUploadBatchSerializer
from apps.wearables.services import (
    WearableRecordConflictError,
    WearableUploadConflictError,
    process_wearable_upload,
)

pytestmark = pytest.mark.django_db


def test_process_wearable_upload_persists_one_valid_batch():
    user = User.objects.create_user(
        email="wearable-ingestion@example.com",
        password="strong-password-123",
    )
    connection = WearableConnection.objects.create(
        user=user,
        provider=WearableConnection.Provider.HEALTH_CONNECT,
    )
    upload_id = uuid.uuid4()
    serializer = WearableUploadBatchSerializer(
        data={
            "connection_id": str(connection.id),
            "upload_id": str(upload_id),
            "entries": [
                {
                    "metric_definition": "body_weight",
                    "value": 78.4,
                    "recorded_at": "2026-07-27T08:00:00Z",
                    "source": "samsung_health",
                    "external_source_id": (
                        "health_connect:WeightRecord:record-service-123"
                    ),
                }
            ],
        }
    )
    assert serializer.is_valid(), serializer.errors
    validated_entries = cast(
        list[dict[str, Any]],
        serializer.validated_data["entries"],
    )

    sync_run, created = process_wearable_upload(
        connection=connection,
        upload_id=upload_id,
        entries=validated_entries,
    )

    assert created is True
    sync_run.refresh_from_db()
    assert sync_run.payload_hash == calculate_wearable_payload_hash(
        validated_entries
    )
    assert sync_run.status == SyncRun.Status.SUCCEEDED
    assert sync_run.processing_started_at is not None
    assert sync_run.finished_at is not None
    assert sync_run.processing_started_at <= sync_run.finished_at
    assert sync_run.entries_imported == 1
    assert sync_run.entries_skipped == 0

    entry = MetricEntry.objects.get()
    body_weight = MetricDefinition.objects.get(slug="body_weight")
    assert entry.user == user
    assert entry.metric_definition == body_weight
    assert entry.value == 78.4
    assert entry.recorded_at.isoformat() == "2026-07-27T08:00:00+00:00"
    assert entry.source == MetricEntry.Source.SAMSUNG_HEALTH
    assert entry.source_connection == connection
    assert (
        entry.external_source_id
        == "health_connect:WeightRecord:record-service-123"
    )

    connection.refresh_from_db()
    assert connection.status == WearableConnection.Status.CONNECTED
    assert connection.last_synced_at == sync_run.finished_at
    assert connection.last_error == ""


def test_process_wearable_upload_reuses_same_payload_retry():
    user = User.objects.create_user(
        email="wearable-ingestion-retry@example.com",
        password="strong-password-123",
    )
    connection = WearableConnection.objects.create(
        user=user,
        provider=WearableConnection.Provider.HEALTH_CONNECT,
    )
    upload_id = uuid.uuid4()
    serializer = WearableUploadBatchSerializer(
        data={
            "connection_id": str(connection.id),
            "upload_id": str(upload_id),
            "entries": [
                {
                    "metric_definition": "body_weight",
                    "value": 78.4,
                    "recorded_at": "2026-07-27T08:00:00Z",
                    "source": "samsung_health",
                    "external_source_id": (
                        "health_connect:WeightRecord:record-service-retry"
                    ),
                }
            ],
        }
    )
    assert serializer.is_valid(), serializer.errors
    validated_entries = cast(
        list[dict[str, Any]],
        serializer.validated_data["entries"],
    )

    first_sync_run, first_created = process_wearable_upload(
        connection=connection,
        upload_id=upload_id,
        entries=validated_entries,
    )
    retry_sync_run, retry_created = process_wearable_upload(
        connection=connection,
        upload_id=upload_id,
        entries=validated_entries,
    )

    assert first_created is True
    assert retry_created is False
    assert retry_sync_run.id == first_sync_run.id
    assert retry_sync_run.finished_at == first_sync_run.finished_at
    assert SyncRun.objects.filter(
        wearable_connection=connection,
        upload_id=upload_id,
    ).count() == 1
    assert MetricEntry.objects.filter(
        source_connection=connection,
    ).count() == 1


def test_process_wearable_upload_rejects_different_payload_retry():
    user = User.objects.create_user(
        email="wearable-ingestion-conflict@example.com",
        password="strong-password-123",
    )
    connection = WearableConnection.objects.create(
        user=user,
        provider=WearableConnection.Provider.HEALTH_CONNECT,
    )
    upload_id = uuid.uuid4()
    original_payload = {
        "connection_id": str(connection.id),
        "upload_id": str(upload_id),
        "entries": [
            {
                "metric_definition": "body_weight",
                "value": 78.4,
                "recorded_at": "2026-07-27T08:00:00Z",
                "source": "samsung_health",
                "external_source_id": (
                    "health_connect:WeightRecord:record-service-conflict"
                ),
            }
        ],
    }
    original_serializer = WearableUploadBatchSerializer(
        data=original_payload,
    )
    assert original_serializer.is_valid(), original_serializer.errors
    original_entries = cast(
        list[dict[str, Any]],
        original_serializer.validated_data["entries"],
    )
    original_sync_run, created = process_wearable_upload(
        connection=connection,
        upload_id=upload_id,
        entries=original_entries,
    )
    assert created is True

    conflicting_serializer = WearableUploadBatchSerializer(
        data={
            **original_payload,
            "entries": [
                {
                    **original_payload["entries"][0],
                    "value": 78.5,
                }
            ],
        }
    )
    assert conflicting_serializer.is_valid(), conflicting_serializer.errors
    conflicting_entries = cast(
        list[dict[str, Any]],
        conflicting_serializer.validated_data["entries"],
    )

    with pytest.raises(
        WearableUploadConflictError,
        match="upload_id is already associated with a different payload",
    ):
        process_wearable_upload(
            connection=connection,
            upload_id=upload_id,
            entries=conflicting_entries,
        )

    assert SyncRun.objects.get().id == original_sync_run.id
    metric_entry = MetricEntry.objects.get()
    assert metric_entry.value == 78.4


def test_process_wearable_upload_rejects_legacy_blank_hash_receipt():
    user = User.objects.create_user(
        email="wearable-ingestion-legacy-receipt@example.com",
        password="strong-password-123",
    )
    connection = WearableConnection.objects.create(
        user=user,
        provider=WearableConnection.Provider.HEALTH_CONNECT,
    )
    upload_id = uuid.uuid4()
    legacy_sync_run = SyncRun.objects.create(
        wearable_connection=connection,
        upload_id=upload_id,
    )
    serializer = WearableUploadBatchSerializer(
        data={
            "connection_id": str(connection.id),
            "upload_id": str(upload_id),
            "entries": [
                {
                    "metric_definition": "body_weight",
                    "value": 78.4,
                    "recorded_at": "2026-07-27T08:00:00Z",
                    "source": "samsung_health",
                    "external_source_id": (
                        "health_connect:WeightRecord:record-legacy-receipt"
                    ),
                }
            ],
        }
    )
    assert serializer.is_valid(), serializer.errors
    validated_entries = cast(
        list[dict[str, Any]],
        serializer.validated_data["entries"],
    )

    with pytest.raises(WearableUploadConflictError):
        process_wearable_upload(
            connection=connection,
            upload_id=upload_id,
            entries=validated_entries,
        )

    assert SyncRun.objects.get().id == legacy_sync_run.id
    assert MetricEntry.objects.exists() is False


def test_process_wearable_upload_skips_identical_external_record():
    user = User.objects.create_user(
        email="wearable-ingestion-external-duplicate@example.com",
        password="strong-password-123",
    )
    connection = WearableConnection.objects.create(
        user=user,
        provider=WearableConnection.Provider.HEALTH_CONNECT,
    )
    entry_payload = {
        "metric_definition": "body_weight",
        "value": 78.4,
        "recorded_at": "2026-07-27T08:00:00Z",
        "source": "samsung_health",
        "external_source_id": (
            "health_connect:WeightRecord:record-external-duplicate"
        ),
    }

    validated_batches: list[tuple[uuid.UUID, list[dict[str, Any]]]] = []
    for upload_id in (uuid.uuid4(), uuid.uuid4()):
        serializer = WearableUploadBatchSerializer(
            data={
                "connection_id": str(connection.id),
                "upload_id": str(upload_id),
                "entries": [entry_payload],
            }
        )
        assert serializer.is_valid(), serializer.errors
        validated_batches.append(
            (
                upload_id,
                cast(
                    list[dict[str, Any]],
                    serializer.validated_data["entries"],
                ),
            )
        )

    first_sync_run, first_created = process_wearable_upload(
        connection=connection,
        upload_id=validated_batches[0][0],
        entries=validated_batches[0][1],
    )
    duplicate_sync_run, duplicate_created = process_wearable_upload(
        connection=connection,
        upload_id=validated_batches[1][0],
        entries=validated_batches[1][1],
    )

    assert first_created is True
    assert duplicate_created is True
    assert duplicate_sync_run.id != first_sync_run.id
    assert duplicate_sync_run.status == SyncRun.Status.SUCCEEDED
    assert duplicate_sync_run.entries_imported == 0
    assert duplicate_sync_run.entries_skipped == 1
    assert SyncRun.objects.count() == 2
    assert MetricEntry.objects.count() == 1


def test_process_wearable_upload_counts_mixed_new_and_duplicate_entries():
    user = User.objects.create_user(
        email="wearable-ingestion-mixed-batch@example.com",
        password="strong-password-123",
    )
    connection = WearableConnection.objects.create(
        user=user,
        provider=WearableConnection.Provider.HEALTH_CONNECT,
    )
    existing_entry_payload = {
        "metric_definition": "body_weight",
        "value": 78.4,
        "recorded_at": "2026-07-27T08:00:00Z",
        "source": "samsung_health",
        "external_source_id": (
            "health_connect:WeightRecord:record-mixed-existing"
        ),
    }
    first_upload_id = uuid.uuid4()
    first_serializer = WearableUploadBatchSerializer(
        data={
            "connection_id": str(connection.id),
            "upload_id": str(first_upload_id),
            "entries": [existing_entry_payload],
        }
    )
    assert first_serializer.is_valid(), first_serializer.errors
    process_wearable_upload(
        connection=connection,
        upload_id=first_upload_id,
        entries=cast(
            list[dict[str, Any]],
            first_serializer.validated_data["entries"],
        ),
    )

    second_upload_id = uuid.uuid4()
    mixed_serializer = WearableUploadBatchSerializer(
        data={
            "connection_id": str(connection.id),
            "upload_id": str(second_upload_id),
            "entries": [
                existing_entry_payload,
                {
                    **existing_entry_payload,
                    "value": 78.8,
                    "recorded_at": "2026-07-28T08:00:00Z",
                    "external_source_id": (
                        "health_connect:WeightRecord:record-mixed-new"
                    ),
                },
            ],
        }
    )
    assert mixed_serializer.is_valid(), mixed_serializer.errors

    mixed_sync_run, created = process_wearable_upload(
        connection=connection,
        upload_id=second_upload_id,
        entries=cast(
            list[dict[str, Any]],
            mixed_serializer.validated_data["entries"],
        ),
    )

    assert created is True
    assert mixed_sync_run.status == SyncRun.Status.SUCCEEDED
    assert mixed_sync_run.entries_imported == 1
    assert mixed_sync_run.entries_skipped == 1
    assert SyncRun.objects.count() == 2
    assert MetricEntry.objects.filter(
        source_connection=connection,
    ).count() == 2


def test_process_wearable_upload_rejects_changed_external_record():
    user = User.objects.create_user(
        email="wearable-ingestion-record-conflict@example.com",
        password="strong-password-123",
    )
    connection = WearableConnection.objects.create(
        user=user,
        provider=WearableConnection.Provider.HEALTH_CONNECT,
    )
    original_entry_payload = {
        "metric_definition": "body_weight",
        "value": 78.4,
        "recorded_at": "2026-07-27T08:00:00Z",
        "source": "samsung_health",
        "external_source_id": (
            "health_connect:WeightRecord:record-content-conflict"
        ),
    }
    first_upload_id = uuid.uuid4()
    first_serializer = WearableUploadBatchSerializer(
        data={
            "connection_id": str(connection.id),
            "upload_id": str(first_upload_id),
            "entries": [original_entry_payload],
        }
    )
    assert first_serializer.is_valid(), first_serializer.errors
    first_sync_run, created = process_wearable_upload(
        connection=connection,
        upload_id=first_upload_id,
        entries=cast(
            list[dict[str, Any]],
            first_serializer.validated_data["entries"],
        ),
    )
    assert created is True

    conflicting_upload_id = uuid.uuid4()
    conflicting_serializer = WearableUploadBatchSerializer(
        data={
            "connection_id": str(connection.id),
            "upload_id": str(conflicting_upload_id),
            "entries": [
                {
                    **original_entry_payload,
                    "value": 78.5,
                }
            ],
        }
    )
    assert conflicting_serializer.is_valid(), conflicting_serializer.errors

    with pytest.raises(
        WearableRecordConflictError,
        match=(
            "external_source_id is already associated with "
            "different content"
        ),
    ):
        process_wearable_upload(
            connection=connection,
            upload_id=conflicting_upload_id,
            entries=cast(
                list[dict[str, Any]],
                conflicting_serializer.validated_data["entries"],
            ),
        )

    assert SyncRun.objects.get().id == first_sync_run.id
    metric_entry = MetricEntry.objects.get()
    assert metric_entry.value == 78.4


def test_process_wearable_upload_updates_newer_external_record_version():
    """A newer source version replaces mutable provider record content."""

    user = User.objects.create_user(
        email="wearable-ingestion-newer-version@example.com",
        password="strong-password-123",
    )
    connection = WearableConnection.objects.create(
        user=user,
        provider=WearableConnection.Provider.HEALTH_CONNECT,
    )
    original_entry_payload = {
        "metric_definition": "steps",
        "value": 2307,
        "period_start": "2026-08-16T22:00:00Z",
        "recorded_at": "2026-08-17T21:59:59.999Z",
        "source": "samsung_health",
        "external_source_id": (
            "health_connect:StepsRecord:record-versioned-steps"
        ),
        "source_record_modified_at": "2026-08-17T17:50:00Z",
    }

    original_serializer = WearableUploadBatchSerializer(
        data={
            "connection_id": str(connection.id),
            "upload_id": str(uuid.uuid4()),
            "entries": [original_entry_payload],
        }
    )
    assert original_serializer.is_valid(), original_serializer.errors
    process_wearable_upload(
        connection=connection,
        upload_id=cast(uuid.UUID, original_serializer.validated_data["upload_id"]),
        entries=cast(
            list[dict[str, Any]],
            original_serializer.validated_data["entries"],
        ),
    )

    newer_serializer = WearableUploadBatchSerializer(
        data={
            "connection_id": str(connection.id),
            "upload_id": str(uuid.uuid4()),
            "entries": [
                {
                    **original_entry_payload,
                    "value": 4812,
                    "source_record_modified_at": "2026-08-17T22:05:00Z",
                }
            ],
        }
    )
    assert newer_serializer.is_valid(), newer_serializer.errors

    sync_run, created = process_wearable_upload(
        connection=connection,
        upload_id=cast(uuid.UUID, newer_serializer.validated_data["upload_id"]),
        entries=cast(
            list[dict[str, Any]],
            newer_serializer.validated_data["entries"],
        ),
    )

    assert created is True
    assert sync_run.entries_imported == 0
    assert sync_run.entries_updated == 1
    assert sync_run.entries_skipped == 0
    entry = MetricEntry.objects.get()
    assert entry.value == 4812
    assert entry.source_record_modified_at.isoformat() == (
        "2026-08-17T22:05:00+00:00"
    )


def test_process_wearable_upload_rejects_older_external_record_version():
    """A stale source version cannot overwrite newer stored content."""

    user = User.objects.create_user(
        email="wearable-ingestion-older-version@example.com",
        password="strong-password-123",
    )
    connection = WearableConnection.objects.create(
        user=user,
        provider=WearableConnection.Provider.HEALTH_CONNECT,
    )
    current_payload = {
        "metric_definition": "steps",
        "value": 4812,
        "period_start": "2026-08-16T22:00:00Z",
        "recorded_at": "2026-08-17T21:59:59.999Z",
        "source": "samsung_health",
        "external_source_id": (
            "health_connect:StepsRecord:record-stale-steps"
        ),
        "source_record_modified_at": "2026-08-17T22:05:00Z",
    }

    current_serializer = WearableUploadBatchSerializer(
        data={
            "connection_id": str(connection.id),
            "upload_id": str(uuid.uuid4()),
            "entries": [current_payload],
        }
    )
    assert current_serializer.is_valid(), current_serializer.errors
    process_wearable_upload(
        connection=connection,
        upload_id=cast(uuid.UUID, current_serializer.validated_data["upload_id"]),
        entries=cast(
            list[dict[str, Any]],
            current_serializer.validated_data["entries"],
        ),
    )

    stale_serializer = WearableUploadBatchSerializer(
        data={
            "connection_id": str(connection.id),
            "upload_id": str(uuid.uuid4()),
            "entries": [
                {
                    **current_payload,
                    "value": 2307,
                    "source_record_modified_at": "2026-08-17T17:50:00Z",
                }
            ],
        }
    )
    assert stale_serializer.is_valid(), stale_serializer.errors

    with pytest.raises(WearableRecordConflictError):
        process_wearable_upload(
            connection=connection,
            upload_id=cast(
                uuid.UUID,
                stale_serializer.validated_data["upload_id"],
            ),
            entries=cast(
                list[dict[str, Any]],
                stale_serializer.validated_data["entries"],
            ),
        )

    entry = MetricEntry.objects.get()
    assert entry.value == 4812
    assert entry.source_record_modified_at.isoformat() == (
        "2026-08-17T22:05:00+00:00"
    )
    assert SyncRun.objects.count() == 1


def test_process_wearable_upload_versions_legacy_external_record():
    """A timestamped provider record can upgrade a pre-versioning row once."""

    user = User.objects.create_user(
        email="wearable-ingestion-legacy-version@example.com",
        password="strong-password-123",
    )
    connection = WearableConnection.objects.create(
        user=user,
        provider=WearableConnection.Provider.HEALTH_CONNECT,
    )
    legacy_payload = {
        "metric_definition": "steps",
        "value": 2307,
        "period_start": "2026-08-16T22:00:00Z",
        "recorded_at": "2026-08-17T21:59:59.999Z",
        "source": "samsung_health",
        "external_source_id": (
            "health_connect:StepsRecord:record-legacy-version"
        ),
    }
    legacy_serializer = WearableUploadBatchSerializer(
        data={
            "connection_id": str(connection.id),
            "upload_id": str(uuid.uuid4()),
            "entries": [legacy_payload],
        }
    )
    assert legacy_serializer.is_valid(), legacy_serializer.errors
    process_wearable_upload(
        connection=connection,
        upload_id=cast(uuid.UUID, legacy_serializer.validated_data["upload_id"]),
        entries=cast(
            list[dict[str, Any]],
            legacy_serializer.validated_data["entries"],
        ),
    )
    assert MetricEntry.objects.get().source_record_modified_at is None

    versioned_serializer = WearableUploadBatchSerializer(
        data={
            "connection_id": str(connection.id),
            "upload_id": str(uuid.uuid4()),
            "entries": [
                {
                    **legacy_payload,
                    "value": 4812,
                    "source_record_modified_at": "2026-08-17T22:05:00Z",
                }
            ],
        }
    )
    assert versioned_serializer.is_valid(), versioned_serializer.errors

    sync_run, created = process_wearable_upload(
        connection=connection,
        upload_id=cast(
            uuid.UUID,
            versioned_serializer.validated_data["upload_id"],
        ),
        entries=cast(
            list[dict[str, Any]],
            versioned_serializer.validated_data["entries"],
        ),
    )

    assert created is True
    assert sync_run.entries_updated == 1
    entry = MetricEntry.objects.get()
    assert entry.value == 4812
    assert entry.source_record_modified_at.isoformat() == (
        "2026-08-17T22:05:00+00:00"
    )
