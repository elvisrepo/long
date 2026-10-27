"""Scenarios: unused deletion, owner isolation, planned/completed and routine/goal
protection, stale eligibility, equipment cleanup, read-only catalog hints.
"""

import pytest
from rest_framework.test import APIClient

from apps.users.models import User
from apps.workouts.models import Exercise, ExerciseCategory
from apps.workouts.models import (
    Workout,
    WorkoutExercise,
    WorkoutSet,
    WorkoutRoutine,
    RoutineDay,
    RoutineExercise,
    ExerciseGoal,
    WorkoutPreferences,
)

pytestmark = pytest.mark.django_db
BASE = "/api/v1/workouts/"


def setup_exercise() -> tuple[APIClient, User, Exercise]:
    user = User.objects.create_user(email="delete@example.com", password="password-123")
    client = APIClient()
    client.force_authenticate(user)
    category = ExerciseCategory.objects.create(user=user, name="Chest")
    exercise = Exercise.objects.create(
        category=category, name="Press", tracking_type="strength"
    )
    return client, user, exercise


def test_unused_exercise_can_be_deleted_without_affecting_its_category() -> None:
    client, _, exercise = setup_exercise()
    category_id = exercise.category_id
    response = client.delete(BASE + f"exercises/{exercise.pk}/")
    assert response.status_code == 204
    assert not Exercise.objects.filter(pk=exercise.pk).exists()
    assert ExerciseCategory.objects.filter(pk=category_id).exists()
    assert client.delete(BASE + f"exercises/{exercise.pk}/").status_code == 404


@pytest.mark.parametrize("usage", ["empty", "planned", "completed", "routine", "goal"])
def test_saved_references_block_deletion_even_without_completed_sets(
    usage: str,
) -> None:
    client, user, exercise = setup_exercise()
    assert client.get(BASE + "catalog/").json()["exercises"][0]["can_delete"] is True
    snapshot = {
        "exercise": exercise,
        "exercise_name": exercise.name,
        "category_name": "Chest",
        "tracking_type": "strength",
        "weight_unit": "kg",
        "distance_unit": "km",
    }
    if usage == "routine":
        routine = WorkoutRoutine.objects.create(
            user=user, name="Routine", is_active=False
        )
        day = RoutineDay.objects.create(routine=routine, name="Day")
        RoutineExercise.objects.create(day=day, **snapshot)
    elif usage == "goal":
        ExerciseGoal.objects.create(
            exercise=exercise,
            target_weight="80",
            target_reps=5,
            weight_unit="kg",
            distance_unit="km",
        )
    else:
        workout = Workout.objects.create(
            user=user, performed_on="2026-10-23", is_finished=usage == "completed"
        )
        item = WorkoutExercise.objects.create(workout=workout, **snapshot)
        if usage != "empty":
            WorkoutSet.objects.create(
                workout_exercise=item,
                weight="60",
                reps=5,
                is_completed=usage == "completed",
            )
    hint = client.get(BASE + "catalog/").json()["exercises"][0]
    assert hint["can_delete"] is False
    if usage != "completed":
        assert hint["trained_session_count"] == 0
    response = client.delete(BASE + f"exercises/{exercise.pk}/")
    assert response.status_code == 409
    assert "Archive" in response.json()["detail"]
    assert Exercise.objects.filter(pk=exercise.pk).exists()
    if usage in {"planned", "completed"}:
        assert WorkoutSet.objects.get().weight == 60
        assert Workout.objects.get().is_finished == (usage == "completed")


def test_deletion_is_owner_scoped_and_requires_authentication() -> None:
    _, _, exercise = setup_exercise()
    client = APIClient()
    url = BASE + f"exercises/{exercise.pk}/"
    assert client.delete(url).status_code == 401
    user = User.objects.create_user(email="other@example.com", password="password-123")
    client.force_authenticate(user)
    assert client.delete(url).status_code == 404
    assert Exercise.objects.filter(pk=exercise.pk).exists()


def test_delete_cleans_only_matching_exercise_bar_preferences() -> None:
    client, user, exercise = setup_exercise()
    other = Exercise.objects.create(
        category=exercise.category, name="Row", tracking_type="strength"
    )
    keep = {"exercise_id": str(other.pk), "weight_unit": "kg", "weight": "15"}
    preferences = WorkoutPreferences.objects.create(
        user=user,
        exercise_bars=[
            {"exercise_id": str(exercise.pk), "weight_unit": "kg", "weight": "20"},
            {"exercise_id": str(exercise.pk), "weight_unit": "lb", "weight": "45"},
            keep,
        ],
    )
    assert client.delete(BASE + f"exercises/{exercise.pk}/").status_code == 204
    preferences.refresh_from_db()
    assert preferences.exercise_bars == [keep]
