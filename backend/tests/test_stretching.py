"""Stretching checklist API and personal-data lifecycle tests."""

import json

import pytest
from rest_framework.test import APIClient

from apps.subscriptions.models import Subscription, SubscriptionPlan
from apps.users.models import User

pytestmark = pytest.mark.django_db


def stretching_client(email: str = "stretching@example.com") -> tuple[APIClient, User]:
    user = User.objects.create_user(email=email, password="account-password-123")
    Subscription.objects.create(
        user=user, plan=SubscriptionPlan.objects.get(code="free"), status="active"
    )
    client = APIClient()
    client.force_authenticate(user)
    return client, user


def test_catalog_requires_authentication() -> None:
    assert APIClient().get("/api/v1/stretching/exercises/").status_code == 401


def test_catalog_has_two_ordered_starter_phases() -> None:
    client, _ = stretching_client()
    response = client.get("/api/v1/stretching/exercises/")
    assert response.status_code == 200
    phases = response.json()["phases"]
    assert [phase["slug"] for phase in phases] == ["lower-body", "upper-body"]
    assert len(phases[0]["exercises"]) == 10
    assert len(phases[1]["exercises"]) == 10
    assert phases[0]["exercises"][0]["name"] == "Lunge Stretch"
    assert phases[0]["exercises"][0]["dosage"] == "30 seconds per leg"
    assert "hip forward" in phases[0]["exercises"][0]["description"].lower()
    assert [exercise["name"] for exercise in phases[1]["exercises"]] == [
        "Foam Rolling Thoracic Spine",
        "Extending Thoracic Spine",
        "Extending Thoracic Spine (Bench)",
        "Wall Pec Stretch",
        "Lats Stretch",
        "Shoulder Stretch",
        "Shoulder Dislocations",
        "Scapular Wall Slide",
        "Chin tuck",
        "Reverse Crunch",
    ]
    assert phases[1]["exercises"][0]["dosage"] == "10× centered, 10× left, 10× right"
    assert "foam roll" in phases[1]["exercises"][0]["description"].lower()


def test_daily_checkoff_is_idempotent_and_user_scoped() -> None:
    client, _ = stretching_client()
    other, _ = stretching_client("other-stretching@example.com")
    exercise = client.get("/api/v1/stretching/exercises/").json()["phases"][0][
        "exercises"
    ][0]
    url = f"/api/v1/stretching/entries/{exercise['id']}/2026-10-09/"
    assert client.put(url, {}, format="json").status_code == 200
    assert client.put(url, {}, format="json").status_code == 200
    assert (
        other.get(
            "/api/v1/stretching/entries/?date_from=2026-10-09&date_to=2026-10-09"
        ).json()
        == []
    )
    assert (
        len(
            client.get(
                "/api/v1/stretching/entries/?date_from=2026-10-09&date_to=2026-10-09"
            ).json()
        )
        == 1
    )
    assert client.delete(url).status_code == 204
    assert client.delete(url).status_code == 204


def test_export_includes_checkoffs_and_account_delete_cascades() -> None:
    from apps.stretching.models import StretchEntry, StretchExercise

    client, user = stretching_client()
    exercise = StretchExercise.objects.get(slug="lower-body-lunge-stretch")
    client.put(
        f"/api/v1/stretching/entries/{exercise.pk}/2026-10-09/", {}, format="json"
    )
    response = client.get("/api/v1/me/export/")
    data = json.loads(b"".join(response.streaming_content))
    assert data["stretching_entries"][0]["exercise_id"] == str(exercise.pk)
    assert data["stretching_entries"][0]["exercise__slug"] == exercise.slug
    assert data["stretching_entries"][0]["exercise__name"] == exercise.name
    assert data["stretching_entries"][0]["exercise__phase"] == exercise.phase
    assert (
        client.delete(
            "/api/v1/me/", {"password": "account-password-123"}, format="json"
        ).status_code
        == 204
    )
    assert not StretchEntry.objects.filter(user=user).exists()
