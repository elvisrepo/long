import uuid
from datetime import UTC, datetime

import pytest
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from apps.metrics.models import MetricEntry
from apps.users.models import User
from apps.wearables.models import SyncRun, WearableConnection

pytestmark = pytest.mark.django_db


def _normalized_entry(external_source_id: str) -> dict[str, object]:
    return {
        "metric_definition": "body_weight",
        "value": 78.4,
        "recorded_at": "2026-07-29T08:00:00Z",
        "source": "samsung_health",
        "external_source_id": external_source_id,
    }


def test_wearable_upload_processes_one_normalized_entry():
    user = User.objects.create_user(
        email="wearable-upload@example.com",
        password="strong-password-123",
    )
    connection = WearableConnection.objects.create(
        user=user,
        provider=WearableConnection.Provider.HEALTH_CONNECT,
    )

    upload_id = uuid.uuid4()

    client = APIClient()
    access_token = RefreshToken.for_user(user).access_token
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {access_token}")

    response = client.post(
        "/api/v1/wearables/uploads/",
        {
            "connection_id": str(connection.id),
            "upload_id": str(upload_id),
            "entries": [
                _normalized_entry(
                    "health_connect:WeightRecord:record-api-123"
                )
            ],
        },
        format="json",
    )

    assert response.status_code == 201

    sync_run = SyncRun.objects.get()
    assert sync_run.wearable_connection == connection
    assert sync_run.upload_id == upload_id
    assert sync_run.status == SyncRun.Status.SUCCEEDED
    assert sync_run.processing_started_at is not None
    assert sync_run.finished_at is not None
    assert sync_run.entries_imported == 1
    assert sync_run.entries_updated == 0
    assert sync_run.entries_skipped == 0

    metric_entry = MetricEntry.objects.get()
    assert metric_entry.user == user
    assert metric_entry.source_connection == connection
    assert metric_entry.value == 78.4
    assert (
        metric_entry.external_source_id
        == "health_connect:WeightRecord:record-api-123"
    )

    assert response.json() == {
        "id": str(sync_run.id),
        "connection_id": str(connection.id),
        "upload_id": str(upload_id),
        "status": "succeeded",
        "received_at": sync_run.received_at.isoformat().replace("+00:00", "Z"),
        "processing_started_at": (
            sync_run.processing_started_at.isoformat().replace("+00:00", "Z")
        ),
        "finished_at": sync_run.finished_at.isoformat().replace(
            "+00:00",
            "Z",
        ),
        "entries_imported": 1,
        "entries_updated": 0,
        "entries_skipped": 0,
    }


def test_wearable_upload_processes_one_normalized_steps_interval():
    user = User.objects.create_user(
        email="steps-upload@example.com",
        password="strong-password-123",
    )
    connection = WearableConnection.objects.create(
        user=user,
        provider=WearableConnection.Provider.HEALTH_CONNECT,
    )

    client = APIClient()
    access_token = RefreshToken.for_user(user).access_token
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {access_token}")

    response = client.post(
        "/api/v1/wearables/uploads/",
        {
            "connection_id": str(connection.id),
            "upload_id": str(uuid.uuid4()),
            "entries": [
                {
                    "metric_definition": "steps",
                    "value": 420,
                    "period_start": "2026-07-29T07:45:00Z",
                    "recorded_at": "2026-07-29T08:00:00Z",
                    "source": "samsung_health",
                    "external_source_id": (
                        "health_connect:StepsRecord:record-api-123"
                    ),
                }
            ],
        },
        format="json",
    )

    assert response.status_code == 201
    assert response.json()["entries_imported"] == 1

    metric_entry = MetricEntry.objects.get()
    assert metric_entry.metric_definition.slug == "steps"
    assert metric_entry.value == 420
    assert metric_entry.period_start == datetime(
        2026,
        7,
        29,
        7,
        45,
        tzinfo=UTC,
    )
    assert metric_entry.recorded_at == datetime(
        2026,
        7,
        29,
        8,
        tzinfo=UTC,
    )


def test_wearable_upload_requires_authentication():
    user = User.objects.create_user(
        email="unauthenticated-upload@example.com",
        password="strong-password-123",
    )
    connection = WearableConnection.objects.create(
        user=user,
        provider=WearableConnection.Provider.HEALTH_CONNECT,
    )

    response = APIClient().post(
        "/api/v1/wearables/uploads/",
        {
            "connection_id": str(connection.id),
            "upload_id": str(uuid.uuid4()),
            "entries": [
                _normalized_entry(
                    "health_connect:WeightRecord:record-unauthenticated"
                )
            ],
        },
        format="json",
    )

    assert response.status_code == 401
    assert SyncRun.objects.exists() is False


def test_wearable_upload_hides_another_users_connection():
    owner = User.objects.create_user(
        email="upload-owner@example.com",
        password="strong-password-123",
    )
    connection = WearableConnection.objects.create(
        user=owner,
        provider=WearableConnection.Provider.HEALTH_CONNECT,
    )

    attacker = User.objects.create_user(
        email="upload-attacker@example.com",
        password="strong-password-123",
    )

    client = APIClient()
    access_token = RefreshToken.for_user(attacker).access_token
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {access_token}")

    response = client.post(
        "/api/v1/wearables/uploads/",
        {
            "connection_id": str(connection.id),
            "upload_id": str(uuid.uuid4()),
            "entries": [
                _normalized_entry(
                    "health_connect:WeightRecord:record-hidden-owner"
                )
            ],
        },
        format="json",
    )

    assert response.status_code == 404
    assert SyncRun.objects.exists() is False


def test_wearable_upload_hides_inactive_owned_connection():
    user = User.objects.create_user(
        email="inactive-upload@example.com",
        password="strong-password-123",
    )
    connection = WearableConnection.objects.create(
        user=user,
        provider=WearableConnection.Provider.HEALTH_CONNECT,
        is_active=False,
    )

    client = APIClient()
    access_token = RefreshToken.for_user(user).access_token
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {access_token}")

    response = client.post(
        "/api/v1/wearables/uploads/",
        {
            "connection_id": str(connection.id),
            "upload_id": str(uuid.uuid4()),
            "entries": [
                _normalized_entry(
                    "health_connect:WeightRecord:record-inactive"
                )
            ],
        },
        format="json",
    )

    assert response.status_code == 404
    assert SyncRun.objects.exists() is False


def test_wearable_upload_rejects_malformed_connection_id():
    user = User.objects.create_user(
        email="malformed-connection-upload@example.com",
        password="strong-password-123",
    )

    client = APIClient()
    access_token = RefreshToken.for_user(user).access_token
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {access_token}")

    response = client.post(
        "/api/v1/wearables/uploads/",
        {
            "connection_id": "not-a-uuid",
            "upload_id": str(uuid.uuid4()),
            "entries": [
                _normalized_entry(
                    "health_connect:WeightRecord:record-malformed-connection"
                )
            ],
        },
        format="json",
    )

    assert response.status_code == 400
    assert response.json() == {
        "connection_id": ["Must be a valid UUID."],
    }
    assert SyncRun.objects.exists() is False


def test_wearable_upload_rejects_malformed_upload_id():
    user = User.objects.create_user(
        email="malformed-upload-id@example.com",
        password="strong-password-123",
    )
    connection = WearableConnection.objects.create(
        user=user,
        provider=WearableConnection.Provider.HEALTH_CONNECT,
    )

    client = APIClient()
    access_token = RefreshToken.for_user(user).access_token
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {access_token}")

    response = client.post(
        "/api/v1/wearables/uploads/",
        {
            "connection_id": str(connection.id),
            "upload_id": "not-a-uuid",
            "entries": [
                _normalized_entry(
                    "health_connect:WeightRecord:record-malformed-upload"
                )
            ],
        },
        format="json",
    )

    assert response.status_code == 400
    assert response.json() == {
        "upload_id": ["Must be a valid UUID."],
    }
    assert SyncRun.objects.exists() is False


def test_wearable_upload_retry_returns_existing_sync_run():
    user = User.objects.create_user(
        email="retry-upload@example.com",
        password="strong-password-123",
    )
    connection = WearableConnection.objects.create(
        user=user,
        provider=WearableConnection.Provider.HEALTH_CONNECT,
    )
    upload_id = uuid.uuid4()

    client = APIClient()
    access_token = RefreshToken.for_user(user).access_token
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {access_token}")

    payload = {
        "connection_id": str(connection.id),
        "upload_id": str(upload_id),
        "entries": [
            _normalized_entry(
                "health_connect:WeightRecord:record-api-retry"
            )
        ],
    }
    first_response = client.post(
        "/api/v1/wearables/uploads/",
        payload,
        format="json",
    )
    retry_response = client.post(
        "/api/v1/wearables/uploads/",
        payload,
        format="json",
    )

    assert first_response.status_code == 201
    assert retry_response.status_code == 200
    assert retry_response.json() == first_response.json()
    assert SyncRun.objects.filter(
        wearable_connection=connection,
        upload_id=upload_id,
    ).count() == 1


def test_wearable_upload_rejects_changed_payload_for_same_upload_id():
    user = User.objects.create_user(
        email="upload-payload-conflict@example.com",
        password="strong-password-123",
    )
    connection = WearableConnection.objects.create(
        user=user,
        provider=WearableConnection.Provider.HEALTH_CONNECT,
    )
    upload_id = uuid.uuid4()

    client = APIClient()
    access_token = RefreshToken.for_user(user).access_token
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {access_token}")

    original_entry = _normalized_entry(
        "health_connect:WeightRecord:record-api-payload-conflict"
    )
    first_response = client.post(
        "/api/v1/wearables/uploads/",
        {
            "connection_id": str(connection.id),
            "upload_id": str(upload_id),
            "entries": [original_entry],
        },
        format="json",
    )
    conflict_response = client.post(
        "/api/v1/wearables/uploads/",
        {
            "connection_id": str(connection.id),
            "upload_id": str(upload_id),
            "entries": [
                {
                    **original_entry,
                    "value": 78.5,
                }
            ],
        },
        format="json",
    )

    assert first_response.status_code == 201
    assert conflict_response.status_code == 409
    assert conflict_response.json() == {
        "detail": (
            "upload_id is already associated with a different payload."
        )
    }
    assert SyncRun.objects.count() == 1
    assert MetricEntry.objects.get().value == 78.4


def test_wearable_upload_rejects_changed_external_record():
    user = User.objects.create_user(
        email="upload-record-conflict@example.com",
        password="strong-password-123",
    )
    connection = WearableConnection.objects.create(
        user=user,
        provider=WearableConnection.Provider.HEALTH_CONNECT,
    )

    client = APIClient()
    access_token = RefreshToken.for_user(user).access_token
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {access_token}")

    original_entry = _normalized_entry(
        "health_connect:WeightRecord:record-api-content-conflict"
    )
    first_response = client.post(
        "/api/v1/wearables/uploads/",
        {
            "connection_id": str(connection.id),
            "upload_id": str(uuid.uuid4()),
            "entries": [original_entry],
        },
        format="json",
    )
    conflict_response = client.post(
        "/api/v1/wearables/uploads/",
        {
            "connection_id": str(connection.id),
            "upload_id": str(uuid.uuid4()),
            "entries": [
                {
                    **original_entry,
                    "value": 78.5,
                }
            ],
        },
        format="json",
    )

    assert first_response.status_code == 201
    assert conflict_response.status_code == 409
    assert conflict_response.json() == {
        "detail": (
            "external_source_id is already associated with "
            "different content."
        )
    }
    assert SyncRun.objects.count() == 1
    assert MetricEntry.objects.get().value == 78.4


def test_wearable_upload_skips_identical_record_from_new_batch():
    user = User.objects.create_user(
        email="upload-record-skip@example.com",
        password="strong-password-123",
    )
    connection = WearableConnection.objects.create(
        user=user,
        provider=WearableConnection.Provider.HEALTH_CONNECT,
    )

    client = APIClient()
    access_token = RefreshToken.for_user(user).access_token
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {access_token}")

    entry = _normalized_entry(
        "health_connect:WeightRecord:record-api-skip"
    )
    first_response = client.post(
        "/api/v1/wearables/uploads/",
        {
            "connection_id": str(connection.id),
            "upload_id": str(uuid.uuid4()),
            "entries": [entry],
        },
        format="json",
    )
    duplicate_response = client.post(
        "/api/v1/wearables/uploads/",
        {
            "connection_id": str(connection.id),
            "upload_id": str(uuid.uuid4()),
            "entries": [entry],
        },
        format="json",
    )

    assert first_response.status_code == 201
    assert duplicate_response.status_code == 201
    assert duplicate_response.json()["entries_imported"] == 0
    assert duplicate_response.json()["entries_skipped"] == 1
    assert SyncRun.objects.count() == 2
    assert MetricEntry.objects.count() == 1


def test_wearable_upload_updates_newer_source_record_version():
    """The public endpoint returns an honest receipt for a provider update."""

    user = User.objects.create_user(
        email="upload-newer-source-version@example.com",
        password="strong-password-123",
    )
    connection = WearableConnection.objects.create(
        user=user,
        provider=WearableConnection.Provider.HEALTH_CONNECT,
    )
    client = APIClient()
    access_token = RefreshToken.for_user(user).access_token
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {access_token}")
    original_entry = {
        "metric_definition": "steps",
        "value": 2307,
        "period_start": "2026-08-16T22:00:00Z",
        "recorded_at": "2026-08-17T21:59:59.999Z",
        "source": "samsung_health",
        "external_source_id": (
            "health_connect:StepsRecord:record-api-versioned"
        ),
        "source_record_modified_at": "2026-08-17T17:50:00Z",
    }

    first_response = client.post(
        "/api/v1/wearables/uploads/",
        {
            "connection_id": str(connection.id),
            "upload_id": str(uuid.uuid4()),
            "entries": [original_entry],
        },
        format="json",
    )
    newer_response = client.post(
        "/api/v1/wearables/uploads/",
        {
            "connection_id": str(connection.id),
            "upload_id": str(uuid.uuid4()),
            "entries": [
                {
                    **original_entry,
                    "value": 4812,
                    "source_record_modified_at": "2026-08-17T22:05:00Z",
                }
            ],
        },
        format="json",
    )

    assert first_response.status_code == 201
    assert newer_response.status_code == 201
    assert newer_response.json()["entries_imported"] == 0
    assert newer_response.json()["entries_updated"] == 1
    assert newer_response.json()["entries_skipped"] == 0
    entry = MetricEntry.objects.get()
    assert entry.value == 4812
    assert entry.source_record_modified_at == datetime(
        2026,
        8,
        17,
        22,
        5,
        tzinfo=UTC,
    )


def test_wearable_upload_requires_entries():
    user = User.objects.create_user(
        email="premature-entry-upload@example.com",
        password="strong-password-123",
    )
    connection = WearableConnection.objects.create(
        user=user,
        provider=WearableConnection.Provider.HEALTH_CONNECT,
    )

    client = APIClient()
    access_token = RefreshToken.for_user(user).access_token
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {access_token}")

    response = client.post(
        "/api/v1/wearables/uploads/",
        {
            "connection_id": str(connection.id),
            "upload_id": str(uuid.uuid4()),
        },
        format="json",
    )

    assert response.status_code == 400
    assert response.json() == {
        "entries": ["This field is required."],
    }
    assert SyncRun.objects.exists() is False
