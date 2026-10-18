import json
import pytest
from datetime import UTC, datetime
from unittest.mock import patch
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from apps.users.models import User
from apps.metrics.models import MetricDefinition, MetricEntry


pytestmark = pytest.mark.django_db


def profile_client(email: str = "profile@example.com") -> tuple[APIClient, User]:
    user = User.objects.create_user(email=email, password="profile-password")
    client = APIClient()
    client.credentials(
        HTTP_AUTHORIZATION=f"Bearer {RefreshToken.for_user(user).access_token}"
    )
    return client, user


def test_personal_info_roundtrip_partial_edit_and_clear() -> None:
    client, user = profile_client()
    data = {"date_of_birth": "1990-04-20", "sex": "male", "height_cm": 180}
    response = client.patch("/api/v1/me/", data, format="json")
    assert response.status_code == 200
    assert {key: response.json()[key] for key in data} == data
    assert response["Cache-Control"] == "no-store"
    response = client.patch("/api/v1/me/", {"height_cm": 181.5}, format="json")
    assert response.json()["date_of_birth"] == "1990-04-20"
    assert client.get("/api/v1/me/").json()["height_cm"] == 181.5
    user.refresh_from_db()
    assert "1990" not in user.personal_info_encrypted
    assert "male" not in user.personal_info_encrypted
    response = client.patch("/api/v1/me/", {"sex": None}, format="json")
    assert response.json()["sex"] is None
    assert response.json()["estimated_bmr"]["value"] is None


def test_bmr_uses_current_age_and_latest_owned_weight() -> None:
    client, user = profile_client()
    definition = MetricDefinition.objects.get(slug="body_weight", user=None)
    entry = MetricEntry.objects.create(
        user=user,
        metric_definition=definition,
        value=80,
        recorded_at="2026-10-15T12:00:00Z",
    )
    with patch(
        "django.utils.timezone.now", return_value=datetime(2026, 10, 16, tzinfo=UTC)
    ):
        response = client.patch(
            "/api/v1/me/",
            {"date_of_birth": "1996-10-16", "sex": "male", "height_cm": 180},
            format="json",
        )
    assert response.status_code == 200
    data = response.json()
    assert data["age"] == 30
    assert data["estimated_bmr"] == {
        "value": 1780,
        "unit": "kcal/day",
        "formula": "mifflin_st_jeor",
        "missing_fields": [],
        "reason": None,
        "weight": {
            "value": 80,
            "recorded_at": "2026-10-15T12:00:00Z",
            "source": "manual",
            "entry_id": entry.pk,
        },
    }


@pytest.mark.parametrize(
    "changes",
    [
        {"date_of_birth": "2999-01-01"},
        {"date_of_birth": "1800-01-01"},
        {"date_of_birth": "bad-date"},
        {"height_cm": 49},
        {"height_cm": 251},
        {"height_cm": "NaN"},
        {"height_cm": "Infinity"},
        {"sex": "other"},
        {"user_id": "someone-else"},
        {"age": 30},
        {"estimated_bmr": 2000},
    ],
)
def test_invalid_profile_changes_are_rejected_atomically(
    changes: dict[str, object],
) -> None:
    client, user = profile_client()
    response = client.patch("/api/v1/me/", {"sex": "female", **changes}, format="json")
    assert response.status_code == 400
    user.refresh_from_db()
    assert user.personal_info_encrypted == ""


def test_female_formula_birthday_and_weight_lifecycle_are_private() -> None:
    client, user = profile_client()
    _, other = profile_client("other-profile@example.com")
    definition = MetricDefinition.objects.get(slug="body_weight", user=None)
    entry = MetricEntry.objects.create(
        user=user,
        metric_definition=definition,
        value=60,
        recorded_at="2026-10-15T12:00:00Z",
    )
    MetricEntry.objects.create(
        user=other,
        metric_definition=definition,
        value=100,
        recorded_at="2026-10-16T11:00:00Z",
    )
    MetricEntry.objects.create(
        user=user,
        metric_definition=definition,
        value=100,
        recorded_at="2099-01-01T00:00:00Z",
    )
    custom = MetricDefinition.objects.create(
        user=user,
        slug="body_weight",
        name="Custom weight",
        unit="lb",
        category="custom",
        min_value=0,
        max_value=1000,
    )
    MetricEntry.objects.create(
        user=user,
        metric_definition=custom,
        value=200,
        recorded_at="2026-10-16T11:00:00Z",
    )
    with patch(
        "django.utils.timezone.now", return_value=datetime(2026, 10, 16, 12, tzinfo=UTC)
    ):
        response = client.patch(
            "/api/v1/me/",
            {"date_of_birth": "1996-10-17", "sex": "female", "height_cm": 165},
            format="json",
        )
        assert response.json()["age"] == 29
        assert response.json()["estimated_bmr"]["value"] == 1325
        entry.value = 65
        entry.save()
        assert client.get("/api/v1/me/").json()["estimated_bmr"]["value"] == 1375
        entry.delete()
        estimate = client.get("/api/v1/me/").json()["estimated_bmr"]
        assert estimate["value"] is None
        assert estimate["missing_fields"] == ["body_weight"]
    other.refresh_from_db()
    assert other.personal_info_encrypted == ""


def test_missing_profile_and_child_profile_do_not_produce_estimates() -> None:
    client, user = profile_client()
    response = client.get("/api/v1/me/")
    assert response.json()["estimated_bmr"]["missing_fields"] == [
        "date_of_birth",
        "sex",
        "height_cm",
        "body_weight",
    ]
    MetricEntry.objects.create(
        user=user,
        metric_definition=MetricDefinition.objects.get(slug="body_weight", user=None),
        value=60,
        recorded_at="2026-10-15T12:00:00Z",
    )
    with patch(
        "django.utils.timezone.now", return_value=datetime(2026, 10, 16, tzinfo=UTC)
    ):
        response = client.patch(
            "/api/v1/me/",
            {"date_of_birth": "2010-01-01", "sex": "male", "height_cm": 170},
            format="json",
        )
    assert response.json()["estimated_bmr"]["value"] is None
    assert response.json()["estimated_bmr"]["reason"] == "adult_only"


@pytest.mark.parametrize("method", ["get", "patch"])
def test_personal_info_requires_authentication(method: str) -> None:
    response = getattr(APIClient(), method)("/api/v1/me/")
    assert response.status_code == 401


def test_account_export_includes_personal_info_without_ciphertext() -> None:
    client, _ = profile_client()
    fields = {"date_of_birth": "1990-04-20", "sex": "male", "height_cm": 180}
    client.patch("/api/v1/me/", fields, format="json")
    response = client.get("/api/v1/me/export/")
    payload = json.loads(b"".join(response.streaming_content))
    assert payload["profile"]["personal_info"] == fields
    assert "personal_info_encrypted" not in payload["profile"]


@pytest.mark.parametrize("value", [10, float("nan"), float("inf")])
def test_invalid_stored_weight_does_not_break_profile_response(value: float) -> None:
    client, user = profile_client()
    client.patch(
        "/api/v1/me/",
        {"date_of_birth": "1990-04-20", "sex": "male", "height_cm": 180},
        format="json",
    )
    MetricEntry.objects.create(
        user=user,
        metric_definition=MetricDefinition.objects.get(slug="body_weight", user=None),
        value=value,
        recorded_at="2026-10-15T12:00:00Z",
    )
    response = client.get("/api/v1/me/")
    assert response.status_code == 200
    assert response.json()["estimated_bmr"]["reason"] == "invalid_weight"
    assert response.json()["estimated_bmr"]["value"] is None


def test_birth_date_uses_exact_120_year_boundary() -> None:
    client, _ = profile_client()
    with patch(
        "apps.users.personal_info.timezone.now",
        return_value=datetime(2026, 10, 18, tzinfo=UTC),
    ):
        assert (
            client.patch(
                "/api/v1/me/", {"date_of_birth": "1906-10-17"}, format="json"
            ).status_code
            == 400
        )
        assert (
            client.patch(
                "/api/v1/me/", {"date_of_birth": "1906-10-18"}, format="json"
            ).status_code
            == 200
        )
