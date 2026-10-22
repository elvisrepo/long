"""All-time exercise reads and atomic copies into the current occurrence."""

from datetime import date
import pytest
from rest_framework.test import APIClient
from apps.users.models import User
from apps.workouts.models import (
    ExerciseCategory,
    Exercise,
    Workout,
    WorkoutExercise,
    WorkoutSet,
)

pytestmark = pytest.mark.django_db
BASE = "/api/v1/workouts/"


def setup_history() -> tuple[
    APIClient, WorkoutExercise, WorkoutExercise, list[WorkoutSet]
]:
    user = User.objects.create_user(email="history@example.com", password="password123")
    client = APIClient()
    client.force_authenticate(user)
    category = ExerciseCategory.objects.create(user=user, name="Chest")
    exercise = Exercise.objects.create(
        category=category, name="Bench", tracking_type="strength"
    )
    old = Workout.objects.create(
        user=user, performed_on=date(2020, 1, 1), is_finished=True
    )
    current = Workout.objects.create(user=user, performed_on=date(2026, 10, 22))
    fields = dict(
        exercise=exercise,
        exercise_name="Bench",
        category_name="Chest",
        tracking_type="strength",
        weight_unit="kg",
        distance_unit="km",
    )
    source = WorkoutExercise.objects.create(workout=old, **fields)
    target = WorkoutExercise.objects.create(workout=current, **fields)
    sets = [
        WorkoutSet.objects.create(
            workout_exercise=source,
            weight=70 + n * 10,
            reps=5,
            comment="keep source",
            is_completed=True,
            display_order=n * 10,
        )
        for n in range(2)
    ]
    return client, source, target, sets


def test_all_time_history_is_paginated_owner_scoped_and_read_only() -> None:
    client, source, target, _ = setup_history()
    response = client.get(
        BASE + "sessions/",
        {
            "all_history": "true",
            "exercise_id": str(source.exercise_id),
            "date_to": "2026-10-22",
            "limit": 1,
        },
    )
    assert response.status_code == 200
    assert response.json()["count"] == 2
    assert response.json()["next"]
    response = client.get(
        BASE + "sessions/",
        {
            "all_history": "true",
            "exercise_id": str(source.exercise_id),
            "date_to": "2026-10-22",
            "limit": 1,
            "offset": 1,
        },
    )
    assert response.json()["results"][0]["id"] == str(source.workout_id)
    assert target.sets.count() == 0


def test_copy_selected_sets_appends_plans_without_changing_source_or_workout() -> None:
    client, source, target, sets = setup_history()
    existing = WorkoutSet.objects.create(
        workout_exercise=target, weight=60, reps=5, display_order=20
    )
    response = client.post(
        BASE + f"session-exercises/{target.pk}/copy-sets/",
        {"source_workout_id": str(source.workout_id), "set_ids": [str(sets[1].pk)]},
        format="json",
    )
    assert response.status_code == 201
    copied = target.sets.exclude(pk=existing.pk).get()
    assert copied.weight == sets[1].weight and copied.reps == 5
    assert not copied.is_completed and copied.comment == ""
    assert copied.display_order > existing.display_order
    assert (
        source.sets.count() == 2 and source.sets.filter(is_completed=True).count() == 2
    )
    assert Workout.objects.count() == 2


@pytest.mark.parametrize(
    "problem",
    ["finished", "units", "foreign", "missing", "duplicate", "extra", "too_many"],
)
def test_copy_rejects_invalid_selection_without_partial_writes(problem: str) -> None:
    from uuid import uuid4

    client, source, target, sets = setup_history()
    payload: dict[str, object] = {
        "source_workout_id": str(source.workout_id),
        "set_ids": [str(sets[0].pk)],
    }
    expected = 400
    if problem == "finished":
        target.workout.is_finished = True
        target.workout.save()
    elif problem == "units":
        source.weight_unit = "lb"
        source.save()
    elif problem == "foreign":
        other = User.objects.create_user(
            email="other-history@example.com", password="password123"
        )
        source.workout.user = other
        source.workout.save()
        expected = 404
    elif problem == "missing":
        payload["set_ids"] = [str(sets[0].pk), str(uuid4())]
    elif problem == "duplicate":
        payload["set_ids"] = [str(sets[0].pk)] * 2
    elif problem == "extra":
        payload["is_completed"] = True
    else:
        payload["set_ids"] = [str(uuid4()) for _ in range(101)]
    response = client.post(
        BASE + f"session-exercises/{target.pk}/copy-sets/", payload, format="json"
    )
    assert response.status_code == expected
    assert target.sets.count() == 0
    assert source.sets.count() == 2


def test_history_requires_an_owned_exercise_and_preserves_range_validation() -> None:
    from uuid import uuid4

    client, source, _, _ = setup_history()
    assert (
        client.get(
            BASE + "sessions/", {"all_history": "true", "date_to": "2026-10-22"}
        ).status_code
        == 400
    )
    assert (
        client.get(
            BASE + "sessions/",
            {
                "all_history": "true",
                "exercise_id": str(uuid4()),
                "date_to": "2026-10-22",
            },
        ).status_code
        == 404
    )
    assert (
        client.get(
            BASE + "sessions/", {"date_from": "2020-01-01", "date_to": "2026-10-22"}
        ).status_code
        == 400
    )
    assert (
        APIClient()
        .get(
            BASE + "sessions/",
            {
                "all_history": "true",
                "exercise_id": str(source.exercise_id),
                "date_to": "2026-10-22",
            },
        )
        .status_code
        == 401
    )


def test_copy_preserves_repeated_occurrence_order_and_does_not_start_timing() -> None:
    client, source, target, sets = setup_history()
    source.display_order = 10
    source.save(update_fields=["display_order"])
    other = WorkoutExercise.objects.create(
        workout=source.workout,
        exercise=source.exercise,
        exercise_name="Bench",
        category_name="Chest",
        tracking_type="strength",
        weight_unit="kg",
        distance_unit="km",
        display_order=20,
    )
    extra = WorkoutSet.objects.create(workout_exercise=other, weight=90, reps=3)
    response = client.post(
        BASE + f"session-exercises/{target.pk}/copy-sets/",
        {
            "source_workout_id": str(source.workout_id),
            "set_ids": [str(extra.pk), str(sets[0].pk)],
        },
        format="json",
    )
    assert response.status_code == 201
    assert [row["weight"] for row in response.json()] == ["70.000", "90.000"]
    target.workout.refresh_from_db()
    assert target.workout.workout_started_at is None
    assert target.workout.timer_started_at is None
    assert not target.sets.filter(is_completed=True).exists()


def test_foreign_target_does_not_receive_copies() -> None:
    client, source, target, sets = setup_history()
    other = User.objects.create_user(
        email="target-other@example.com", password="password123"
    )
    target.workout.user = other
    target.workout.save()
    assert (
        client.post(
            BASE + f"session-exercises/{target.pk}/copy-sets/",
            {"source_workout_id": str(source.workout_id), "set_ids": [str(sets[0].pk)]},
            format="json",
        ).status_code
        == 404
    )
    assert target.sets.count() == 0
