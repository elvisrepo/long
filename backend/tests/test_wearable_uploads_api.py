import uuid

import pytest
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from apps.users.models import User
from apps.wearables.models import SyncRun, WearableConnection

pytestmark = pytest.mark.django_db


def test_wearable_upload_creates_received_sync_run_for_owned_connection():
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
        },
        format="json",
    )

    assert response.status_code == 201

    sync_run = SyncRun.objects.get()
    assert sync_run.wearable_connection == connection
    assert sync_run.upload_id == upload_id
    assert sync_run.status == SyncRun.Status.RECEIVED
    assert sync_run.processing_started_at is None
    assert sync_run.finished_at is None
    assert sync_run.entries_imported == 0
    assert sync_run.entries_skipped == 0

    assert response.json() == {
        "id": str(sync_run.id),
        "connection_id": str(connection.id),
        "upload_id": str(upload_id),
        "status": "received",
        "received_at": sync_run.received_at.isoformat().replace("+00:00", "Z"),
        "processing_started_at": None,
        "finished_at": None,
        "entries_imported": 0,
        "entries_skipped": 0,
    }


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


def test_wearable_upload_rejects_entries_until_ingestion_is_available():
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
            "entries": [
                {
                    "metric_definition": "body_weight",
                    "value": 78.4,
                    "recorded_at": "2026-07-27T08:00:00Z",
                    "source": "samsung_health",
                    "external_source_id": (
                        "health_connect:WeightRecord:record-premature"
                    ),
                }
            ],
        },
        format="json",
    )

    assert response.status_code == 400
    assert response.json() == {
        "entries": ["This field is not supported yet."],
    }
    assert SyncRun.objects.exists() is False
