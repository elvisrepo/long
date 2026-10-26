"""Atomic preset replacement: nulls, invalid/stale drafts, ownership and archives."""

import pytest
from rest_framework.test import APIClient
from tests.test_workout_routine_actions import fixture, BASE

pytestmark = pytest.mark.django_db


def test_replaces_a_preset_draft_atomically_and_rejects_stale_or_invalid_rows() -> None:
    client, routine, day = fixture()
    item = day["exercises"][0]
    url = BASE + f"routine-exercises/{item['id']}/sets/"
    original = item["sets"]
    data = {
        "expected_sets": original,
        "sets": [{"weight": None, "reps": 10}, {"weight": "0", "reps": 12}],
    }
    response = client.put(url, data, format="json")
    assert response.status_code == 200
    saved = response.json()["sets"]
    assert [(row["weight"], row["reps"]) for row in saved] == [
        (None, 10),
        ("0.000", 12),
    ]
    assert [row["display_order"] for row in saved] == [10, 20]
    assert client.put(url, data, format="json").status_code == 409
    assert (
        client.put(
            url,
            {
                "expected_sets": saved,
                "sets": [{"weight": "30", "reps": 8}, {"reps": -1}],
            },
            format="json",
        ).status_code
        == 400
    )
    assert (
        client.get(BASE + "routines/").json()[0]["days"][0]["exercises"][0]["sets"]
        == saved
    )


def test_replacement_can_clear_presets_but_cannot_change_started_workouts() -> None:
    from apps.workouts.models import WorkoutSet

    client, routine, day = fixture()
    assert (
        client.post(
            BASE + f"routine-days/{day['id']}/start/",
            {"performed_on": "2026-10-26"},
            format="json",
        ).status_code
        == 201
    )
    before = list(WorkoutSet.objects.values())
    item = day["exercises"][0]
    url = BASE + f"routine-exercises/{item['id']}/sets/"
    response = client.put(
        url, {"expected_sets": item["sets"], "sets": []}, format="json"
    )
    assert response.status_code == 200 and response.json()["sets"] == []
    assert list(WorkoutSet.objects.values()) == before
    client.patch(
        BASE + f"routines/{routine['id']}/", {"is_active": False}, format="json"
    )
    assert (
        client.put(url, {"expected_sets": [], "sets": []}, format="json").status_code
        == 400
    )


def test_replacement_rejects_foreign_parents_performance_fields_and_large_drafts() -> (
    None
):
    from apps.users.models import User

    client, routine, day = fixture()
    item = day["exercises"][0]
    url = BASE + f"routine-exercises/{item['id']}/sets/"
    data = {"expected_sets": item["sets"], "sets": [{"reps": 8, "is_completed": True}]}
    assert client.put(url, data, format="json").status_code == 400
    assert (
        client.put(
            url,
            {"expected_sets": item["sets"], "sets": [{"reps": 8}] * 1001},
            format="json",
        ).status_code
        == 400
    )
    assert APIClient().put(url, data, format="json").status_code == 401
    other = APIClient()
    other.force_authenticate(
        User.objects.create_user(
            email="foreign-presets@example.test", password="password-123"
        )
    )
    assert other.put(url, {}, format="json").status_code == 404
    assert (
        client.get(BASE + "routines/").json()[0]["days"][0]["exercises"][0]["sets"]
        == item["sets"]
    )
