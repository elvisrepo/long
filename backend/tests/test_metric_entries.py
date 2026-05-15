import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

pytestmark = pytest.mark.django_db


def authenticate_client_for(email: str) -> tuple[APIClient, object]:
    client = APIClient()
    user = get_user_model().objects.create_user(
        email=email,
        password="strong-password-123",
    )

    refresh = RefreshToken.for_user(user)
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {refresh.access_token}")
    return client, user


def test_authenticated_user_can_create_metric_entry_for_default_metric():
    client, _user = authenticate_client_for("alice@example.com")

    response = client.post(
        "/api/v1/metrics/entries/",
        {
            # Public API uses the metric slug, not the database UUID.
            "metric_definition": "resting_hr",
            "value": 58,
            "recorded_at": "2026-03-05T07:15:00Z",
            "context": {"notes": "morning measurement"},
        },
        format="json",
    )

    assert response.status_code == 201

    data = response.json()
    assert data["id"]
    assert data["metric_definition"] == "resting_hr"
    assert data["value"] == 58
    assert data["recorded_at"] == "2026-03-05T07:15:00Z"
    assert data["source"] == "manual"
    assert data["context"] == {"notes": "morning measurement"}
    assert data["created_at"]
