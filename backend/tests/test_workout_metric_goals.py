"""Metric goals: validation, completed same-set values, pace direction,
frozen type/units, corrections, source ownership, export and legacy strength.
"""

from decimal import Decimal
import json

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
BASE = "/api/v1/workouts/"


def fixture(
    kind: str = "cardio", email: str = "metric-goals@example.com"
) -> tuple[APIClient, Exercise]:
    user = User.objects.create_user(email=email, password="password-123")
    client = APIClient()
    client.force_authenticate(user)
    category = ExerciseCategory.objects.create(user=user, name="Training")
    return client, Exercise.objects.create(
        category=category, name="Exercise", tracking_type=kind
    )


def logged(exercise: Exercise, day: str = "2026-10-05", **fields: object) -> WorkoutSet:
    workout = Workout.objects.create(user=exercise.category.user, performed_on=day)
    item = WorkoutExercise.objects.create(
        workout=workout,
        exercise=exercise,
        exercise_name=exercise.name,
        category_name="Training",
        tracking_type=exercise.tracking_type,
        weight_unit=exercise.weight_unit,
        distance_unit=exercise.distance_unit,
    )
    return WorkoutSet.objects.create(workout_exercise=item, **fields)


def test_bodyweight_reps_goal_uses_completed_snapshot_not_planned_work() -> None:
    client, exercise = fixture("bodyweight")
    supported = logged(exercise, reps=10, is_completed=True)
    logged(exercise, reps=99, is_completed=False)
    path = BASE + f"exercises/{exercise.pk}/goals/"
    created = client.post(
        path, {"goal_type": "reps", "target_value": "10"}, format="json"
    )
    assert created.status_code == 201
    result = client.get(path, {"date_to": "2026-10-05"}).json()[0]
    assert result["achieved"] is True
    assert Decimal(result["best_value"]) == 10
    assert result["source"]["set_id"] == str(supported.pk)
    supported.is_completed = False
    supported.save()
    result = client.get(path, {"date_to": "2026-10-05"}).json()[0]
    assert result["achieved"] is False and result["best_value"] is None


@pytest.mark.parametrize(
    "kind,target,best",
    [
        ("distance", "5", "5"),
        ("duration", "1200", "1500"),
        ("max_speed", "12", "12"),
        ("best_pace", "5", "5"),
    ],
)
def test_cardio_targets_use_completed_same_set_values(
    kind: str, target: str, best: str
) -> None:
    client, exercise = fixture()
    supported = logged(exercise, distance="5", duration_seconds=1500, is_completed=True)
    logged(exercise, distance="100", duration_seconds=1, is_completed=False)
    logged(
        exercise, "2026-10-06", distance="100", duration_seconds=1, is_completed=True
    )
    path = BASE + f"exercises/{exercise.pk}/goals/"
    assert (
        client.post(
            path, {"goal_type": kind, "target_value": target}, format="json"
        ).status_code
        == 201
    )
    result = client.get(path, {"date_to": "2026-10-05"}).json()[0]
    assert Decimal(result["best_value"]) == Decimal(best)
    assert result["achieved"] is True and result["progress_percent"] == "100.0"
    assert result["source"]["set_id"] == str(supported.pk)
    assert result["source"]["distance"] == "5.000"
    assert result["source"]["duration_seconds"] == 1500


def test_pace_uses_lower_is_better_and_recomputes_after_correction() -> None:
    client, exercise = fixture()
    logged(exercise, distance="5", duration_seconds=1800, is_completed=True)
    fast = logged(exercise, distance="5", duration_seconds=1500, is_completed=True)
    # A rate never combines separate sets or substitutes null/zero duration.
    logged(exercise, distance="100", duration_seconds=None, is_completed=True)
    logged(exercise, distance=None, duration_seconds=1, is_completed=True)
    path = BASE + f"exercises/{exercise.pk}/goals/"
    goal = client.post(
        path, {"goal_type": "best_pace", "target_value": "4.5"}, format="json"
    ).json()
    result = client.get(path, {"date_to": "2026-10-05"}).json()[0]
    assert Decimal(result["best_value"]) == 5
    assert result["achieved"] is False and result["progress_percent"] == "90.0"
    fast.is_completed = False
    fast.save()
    result = client.get(path, {"date_to": "2026-10-05"}).json()[0]
    assert Decimal(result["best_value"]) == 6 and result["progress_percent"] == "75.0"
    assert (
        client.patch(
            BASE + f"goals/{goal['id']}/", {"target_value": "6"}, format="json"
        ).status_code
        == 200
    )
    assert client.get(path, {"date_to": "2026-10-05"}).json()[0]["achieved"] is True


def test_frozen_type_units_ownership_and_archived_goal_editing() -> None:
    client, exercise = fixture()
    supported = logged(exercise, distance="5", duration_seconds=1500, is_completed=True)
    mismatch = logged(exercise, distance="99", duration_seconds=1, is_completed=True)
    mismatch.workout_exercise.distance_unit = "mi"
    mismatch.workout_exercise.save()
    other, foreign = fixture(email="foreign-goals@example.com")
    invalid = logged(exercise, distance="999", duration_seconds=1, is_completed=True)
    invalid.workout_exercise.workout.user = foreign.category.user
    invalid.workout_exercise.workout.save()
    path = BASE + f"exercises/{exercise.pk}/goals/"
    goal = client.post(
        path, {"goal_type": "distance", "target_value": "5"}, format="json"
    ).json()
    detail = BASE + f"goals/{goal['id']}/"
    assert other.get(path, {"date_to": "2026-10-05"}).status_code == 404
    assert other.patch(detail, {"target_value": "3"}, format="json").status_code == 404
    assert APIClient().get(path, {"date_to": "2026-10-05"}).status_code == 401
    exercise.tracking_type = "strength"
    exercise.distance_unit = "mi"
    exercise.is_active = False
    exercise.save()
    result = client.get(path, {"date_to": "2026-10-05"}).json()[0]
    assert result["tracking_type"] == "cardio" and result["distance_unit"] == "km"
    assert result["source"]["set_id"] == str(supported.pk)
    assert (
        client.patch(detail, {"goal_type": "duration"}, format="json").status_code
        == 400
    )
    assert (
        client.patch(detail, {"distance_unit": "mi"}, format="json").status_code == 400
    )
    assert client.patch(detail, {"target_value": "6"}, format="json").status_code == 200
    assert (
        client.post(
            path, {"target_weight": "10", "target_reps": 5}, format="json"
        ).status_code
        == 400
    )


@pytest.mark.parametrize(
    "kind,value",
    [
        ("reps", "1.5"),
        ("duration", "1.5"),
        ("distance", "0"),
        ("max_speed", "-1"),
        ("best_pace", "0"),
        ("distance", "100001"),
        ("duration", "604801"),
    ],
)
def test_invalid_targets_do_not_create_goals(kind: str, value: str) -> None:
    client, exercise = fixture("bodyweight" if kind == "reps" else "cardio")
    path = BASE + f"exercises/{exercise.pk}/goals/"
    assert (
        client.post(
            path, {"goal_type": kind, "target_value": value}, format="json"
        ).status_code
        == 400
    )
    assert client.get(path, {"date_to": "2026-10-05"}).json() == []


def test_rate_goal_achievement_is_not_based_on_rounded_display_value() -> None:
    client, exercise = fixture()
    logged(exercise, distance="2.001", duration_seconds=601, is_completed=True)
    path = BASE + f"exercises/{exercise.pk}/goals/"
    client.post(
        path, {"goal_type": "max_speed", "target_value": "11.987"}, format="json"
    )
    result = client.get(path, {"date_to": "2026-10-05"}).json()[0]
    assert Decimal(result["best_value"]) < Decimal("11.987")
    assert result["achieved"] is False
    assert result["progress_percent"] == "99.9"


def test_metric_goals_export_delete_and_limit_leave_sets_untouched() -> None:
    client, exercise = fixture("bodyweight")
    saved = logged(exercise, reps=10, is_completed=True)
    path = BASE + f"exercises/{exercise.pk}/goals/"
    for _ in range(20):
        assert (
            client.post(
                path, {"goal_type": "reps", "target_value": "10"}, format="json"
            ).status_code
            == 201
        )
    assert (
        client.post(
            path, {"goal_type": "reps", "target_value": "11"}, format="json"
        ).status_code
        == 400
    )
    response = client.get("/api/v1/me/export/")
    goals = json.loads(b"".join(response.streaming_content))["exercise_goals"]
    assert len(goals) == 20 and goals[0]["goal_type"] == "reps"
    assert (
        goals[0]["tracking_type"] == "bodyweight"
        and Decimal(goals[0]["target_value"]) == 10
    )
    assert client.delete(BASE + f"goals/{goals[0]['id']}/").status_code == 204
    assert WorkoutSet.objects.filter(pk=saved.pk).exists()


@pytest.mark.parametrize(
    "kind,payload",
    [
        ("bodyweight", {"goal_type": "distance", "target_value": "5"}),
        ("cardio", {"goal_type": "reps", "target_value": "10"}),
        (
            "cardio",
            {"goal_type": "distance", "target_value": "5", "target_weight": "10"},
        ),
        ("cardio", {"goal_type": "max_speed"}),
        ("cardio", {"goal_type": "invalid", "target_value": "1"}),
    ],
)
def test_goal_type_and_shape_must_match_active_exercise(
    kind: str, payload: dict[str, object]
) -> None:
    client, exercise = fixture(kind)
    assert (
        client.post(
            BASE + f"exercises/{exercise.pk}/goals/", payload, format="json"
        ).status_code
        == 400
    )
