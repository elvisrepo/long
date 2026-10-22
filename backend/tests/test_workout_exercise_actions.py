"""Selected exercise deletion and drag order are atomic and owner scoped."""

import pytest
from rest_framework.test import APIClient

from apps.users.models import User
from apps.workouts.models import (
    Exercise,
    ExerciseCategory,
    Workout,
    WorkoutExercise,
    WorkoutSet,
)

pytestmark = pytest.mark.django_db


def setup_workout() -> tuple[APIClient, Workout, list[WorkoutExercise]]:
    user = User.objects.create_user(
        email="selection@example.com", password="password-123"
    )
    client = APIClient()
    client.force_authenticate(user)
    category = ExerciseCategory.objects.create(user=user, name="Back")
    exercise = Exercise.objects.create(category=category, name="Row")
    workout = Workout.objects.create(user=user, performed_on="2026-10-22")
    items = [
        WorkoutExercise.objects.create(
            workout=workout,
            exercise=exercise,
            exercise_name=f"Row {n}",
            category_name="Back",
            tracking_type="strength",
            display_order=n * 10,
        )
        for n in range(3)
    ]
    for item in items:
        WorkoutSet.objects.create(
            workout_exercise=item, weight=70, reps=5, is_completed=True
        )
    return client, workout, items


def test_delete_selected_exercises_keeps_session_library_and_other_entries() -> None:
    client, workout, items = setup_workout()
    response = client.post(
        f"/api/v1/workouts/sessions/{workout.id}/exercises/bulk/",
        {"action": "delete", "exercise_ids": [str(item.id) for item in items[:2]]},
        format="json",
    )
    assert response.status_code == 200
    assert list(workout.exercises.values_list("id", flat=True)) == [items[2].id]
    assert WorkoutSet.objects.count() == 1
    assert Exercise.objects.count() == 1
    assert Workout.objects.filter(pk=workout.id).exists()


def test_reorder_preserves_sets_and_rejects_a_stale_order() -> None:
    client, workout, items = setup_workout()
    url = f"/api/v1/workouts/sessions/{workout.id}/exercises/bulk/"
    before = list(WorkoutSet.objects.order_by("id").values())
    ids = [str(item.id) for item in items]
    response = client.post(
        url,
        {"action": "reorder", "exercise_ids": ids[::-1], "expected_order": ids},
        format="json",
    )
    assert response.status_code == 200
    assert [item["id"] for item in response.json()["exercises"]] == ids[::-1]
    assert list(WorkoutSet.objects.order_by("id").values()) == before
    stale = client.post(
        url,
        {"action": "reorder", "exercise_ids": ids, "expected_order": ids},
        format="json",
    )
    assert stale.status_code == 409
    assert [
        str(value) for value in workout.exercises.values_list("id", flat=True)
    ] == ids[::-1]


def test_missing_selection_rejects_all_deletions_and_foreign_user_is_hidden() -> None:
    from uuid import uuid4

    client, workout, items = setup_workout()
    url = f"/api/v1/workouts/sessions/{workout.id}/exercises/bulk/"
    data = {"action": "delete", "exercise_ids": [str(items[0].id), str(uuid4())]}
    assert client.post(url, data, format="json").status_code == 404
    assert workout.exercises.count() == 3
    assert WorkoutSet.objects.count() == 3
    stranger = User.objects.create_user(
        email="stranger@example.com", password="password-123"
    )
    other = APIClient()
    other.force_authenticate(stranger)
    assert other.post(url, data, format="json").status_code == 404
    assert APIClient().post(url, data, format="json").status_code == 401
    workout.is_finished = True
    workout.save()
    assert (
        client.post(
            url, {"action": "delete", "exercise_ids": [str(items[0].id)]}, format="json"
        ).status_code
        == 400
    )
    assert workout.exercises.count() == 3


@pytest.mark.parametrize("action", ["delete", "reorder"])
def test_duplicate_ids_are_rejected_without_writes(action: str) -> None:
    client, workout, items = setup_workout()
    ids = [str(item.id) for item in items]
    payload = {"action": action, "exercise_ids": [ids[0], ids[0]]}
    if action == "reorder":
        payload["expected_order"] = ids
    assert (
        client.post(
            f"/api/v1/workouts/sessions/{workout.id}/exercises/bulk/",
            payload,
            format="json",
        ).status_code
        == 400
    )
    assert workout.exercises.count() == 3
