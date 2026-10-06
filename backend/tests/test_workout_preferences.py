"""Scenarios: defaults/read-only GET, persistence/ownership, inventory validation,
catalog favorites/history hints, lifecycle, frozen history and preferred graphs.
"""

import pytest
from rest_framework.test import APIClient
from apps.users.models import User

pytestmark = pytest.mark.django_db
BASE = "/api/v1/workouts/"


def test_catalog_usage_aggregation_retains_explicit_library_order() -> None:
    from apps.workouts.models import Exercise, ExerciseCategory

    client = client_for("ordering@example.com")
    user = User.objects.get_by_natural_key("ordering@example.com")
    category = ExerciseCategory.objects.create(user=user, name="Chest")
    Exercise.objects.create(
        category=category, name="Zulu", tracking_type="strength", display_order=10
    )
    Exercise.objects.create(
        category=category, name="Alpha", tracking_type="strength", display_order=20
    )
    names = [row["name"] for row in client.get(BASE + "catalog/").json()["exercises"]]
    assert names == ["Zulu", "Alpha"]


def test_preferences_export_and_deletion_preserve_other_accounts() -> None:
    import json
    from apps.users.account import account_export, delete_account
    from apps.workouts.models import WorkoutPreferences

    client = client_for("preferences@example.com")
    other = client_for("other@example.com")
    client.patch(BASE + "preferences/", {"bar_kg": "15"}, format="json")
    other.patch(BASE + "preferences/", {"bar_kg": "10"}, format="json")
    user = User.objects.get_by_natural_key("preferences@example.com")
    data = json.loads("".join(account_export(user)))
    assert len(data["workout_preferences"]) == 1
    assert data["workout_preferences"][0]["bar_kg"] == "15.000"
    delete_account(user=user, password="password123")
    assert WorkoutPreferences.objects.count() == 1
    assert other.get(BASE + "preferences/").json()["bar_kg"] == "10.000"


def client_for(email: str) -> APIClient:
    client = APIClient()
    client.force_authenticate(
        User.objects.create_user(email=email, password="password123")
    )
    return client


def test_preferences_have_private_defaults_and_persist_only_explicit_changes() -> None:
    client = client_for("preferences@example.com")
    other = client_for("other@example.com")
    response = client.get(BASE + "preferences/")
    assert response.status_code == 200
    assert response.json()["auto_start_rest"] is False
    assert response.json()["auto_advance_groups"] is True
    response = client.patch(
        BASE + "preferences/",
        {
            "auto_start_rest": True,
            "bar_kg": "15.000",
            "plates_kg": [{"weight": "20.000", "count": 4}],
        },
        format="json",
    )
    assert response.status_code == 200
    assert client.get(BASE + "preferences/").json()["bar_kg"] == "15.000"
    assert (
        client.get(BASE + "catalog/").json()["preferences"]["auto_start_rest"] is True
    )
    assert other.get(BASE + "preferences/").json()["bar_kg"] == "20.000"
    assert APIClient().get(BASE + "preferences/").status_code == 401


@pytest.mark.parametrize(
    "data",
    [
        {"bar_kg": -1},
        {"bar_lb": "1001"},
        {"plates_kg": [{"weight": 0, "count": 2}]},
        {"plates_lb": [{"weight": 45, "count": 101}]},
        {"plates_kg": [{"weight": 20, "count": 2}, {"weight": "20.000", "count": 4}]},
        {"plates_kg": [{"weight": n + 1, "count": 2} for n in range(21)]},
    ],
)
def test_preferences_reject_invalid_inventory_without_creating_rows(
    data: dict[str, object],
) -> None:
    from apps.workouts.models import WorkoutPreferences

    client = client_for("preferences@example.com")
    assert client.patch(BASE + "preferences/", data, format="json").status_code == 400
    assert not WorkoutPreferences.objects.exists()
    client.get(BASE + "preferences/")
    client.get(BASE + "catalog/")
    assert not WorkoutPreferences.objects.exists()


def test_favorites_graph_defaults_and_catalog_hints_preserve_completed_history() -> (
    None
):
    from apps.workouts.models import (
        Exercise,
        ExerciseCategory,
        Workout,
        WorkoutExercise,
        WorkoutSet,
    )

    client = client_for("catalog@example.com")
    user = User.objects.get_by_natural_key("catalog@example.com")
    category = ExerciseCategory.objects.create(user=user, name="Chest")
    exercise = Exercise.objects.create(
        category=category, name="Bench", tracking_type="strength"
    )
    workout = Workout.objects.create(user=user, performed_on="2026-09-01")
    item = WorkoutExercise.objects.create(
        workout=workout,
        exercise=exercise,
        exercise_name="Bench",
        category_name="Chest",
        tracking_type="strength",
        weight_unit="kg",
        distance_unit="km",
    )
    WorkoutSet.objects.create(workout_exercise=item, weight="70", reps=5)
    WorkoutSet.objects.create(workout_exercise=item, weight="70", reps=5)
    result = client.patch(
        BASE + f"exercises/{exercise.pk}/",
        {"is_favorite": True, "default_graph": "max_volume"},
        format="json",
    )
    assert result.status_code == 200
    result = client.get(BASE + "catalog/").json()["exercises"][0]
    assert result["is_favorite"] and result["default_graph"] == "max_volume"
    assert (
        result["trained_session_count"] == 1 and result["last_used_on"] == "2026-09-01"
    )
    assert (
        client.patch(
            BASE + f"exercises/{exercise.pk}/", {"default_graph": "bad"}, format="json"
        ).status_code
        == 400
    )
    assert (
        client_for("foreign@example.com")
        .patch(
            BASE + f"exercises/{exercise.pk}/", {"is_favorite": False}, format="json"
        )
        .status_code
        == 404
    )
    assert (
        WorkoutSet.objects.filter(workout_exercise=item, weight="70", reps=5).count()
        == 2
    )
