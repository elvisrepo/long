import uuid

import pytest
from django.contrib.auth import get_user_model
from django.db import IntegrityError, transaction

from apps.wearables.models import SyncRun, WearableConnection

pytestmark = pytest.mark.django_db


def test_sync_run_rejects_duplicate_upload_id_for_same_connection():
    user = get_user_model().objects.create_user(
        email="sync-run-idempotency@example.com",
        password="strong-password-123",
    )
    connection = WearableConnection.objects.create(
        user=user,
        provider=WearableConnection.Provider.HEALTH_CONNECT,
    )
    upload_id = uuid.uuid4()

    SyncRun.objects.create(
        wearable_connection=connection,
        upload_id=upload_id,
    )

    with pytest.raises(IntegrityError):
        with transaction.atomic():
            SyncRun.objects.create(
                wearable_connection=connection,
                upload_id=upload_id,
            )


def test_sync_run_allows_same_upload_id_for_different_connections():
    first_user = get_user_model().objects.create_user(
        email="first-sync-run@example.com",
        password="strong-password-123",
    )
    second_user = get_user_model().objects.create_user(
        email="second-sync-run@example.com",
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
    upload_id = uuid.uuid4()

    SyncRun.objects.create(
        wearable_connection=first_connection,
        upload_id=upload_id,
    )
    SyncRun.objects.create(
        wearable_connection=second_connection,
        upload_id=upload_id,
    )

    assert SyncRun.objects.filter(upload_id=upload_id).count() == 2


def test_sync_run_starts_received_with_empty_processing_result():
    user = get_user_model().objects.create_user(
        email="sync-run-defaults@example.com",
        password="strong-password-123",
    )
    connection = WearableConnection.objects.create(
        user=user,
        provider=WearableConnection.Provider.HEALTH_CONNECT,
    )

    sync_run = SyncRun.objects.create(
        wearable_connection=connection,
        upload_id=uuid.uuid4(),
    )

    assert sync_run.status == SyncRun.Status.RECEIVED
    assert sync_run.received_at is not None
    assert sync_run.processing_started_at is None
    assert sync_run.finished_at is None
    assert sync_run.entries_imported == 0
    assert sync_run.entries_updated == 0
    assert sync_run.entries_skipped == 0
    assert sync_run.payload_hash == ""
    assert sync_run.error_code == ""
    assert sync_run.error_detail == {}
    assert sync_run.metadata == {}


def test_sync_run_stores_payload_hash():
    user = get_user_model().objects.create_user(
        email="sync-run-payload-hash@example.com",
        password="strong-password-123",
    )
    connection = WearableConnection.objects.create(
        user=user,
        provider=WearableConnection.Provider.HEALTH_CONNECT,
    )
    payload_hash = "a" * 64

    sync_run = SyncRun.objects.create(
        wearable_connection=connection,
        upload_id=uuid.uuid4(),
        payload_hash=payload_hash,
    )

    assert sync_run.payload_hash == payload_hash
