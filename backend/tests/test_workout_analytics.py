"""Progress controls, dated statistics and scalar strength goals."""

from decimal import Decimal
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


def fixture() -> tuple[APIClient, Exercise]:
    user = User.objects.create_user(
        email="analytics@example.com", password="password123"
    )
    client = APIClient()
    client.force_authenticate(user)
    category = ExerciseCategory.objects.create(user=user, name="Chest")
    exercise = Exercise.objects.create(
        category=category, name="Bench", tracking_type="strength"
    )
    for day, weight, reps in [("2026-01-01", 100, 5), ("2026-10-01", 110, 12)]:
        workout = Workout.objects.create(user=user, performed_on=day)
        item = WorkoutExercise.objects.create(
            workout=workout,
            exercise=exercise,
            exercise_name="Bench",
            category_name="Chest",
            tracking_type="strength",
            weight_unit="kg",
            distance_unit="km",
        )
        WorkoutSet.objects.create(
            workout_exercise=item, weight=weight, reps=reps, is_completed=True
        )
    return client, exercise


def test_statistics_filters_dates_and_returns_dated_bests() -> None:
    client, exercise = fixture()
    response = client.get(
        BASE + f"exercises/{exercise.pk}/stats/",
        {"date_from": "2026-10-01", "date_to": "2026-10-22"},
    )
    assert response.status_code == 200
    group = response.json()["groups"][0]
    assert group["set_count"] == 1
    assert group["bests"]["max_weight"]["value"] == "110.000"
    assert group["bests"]["max_weight"]["date"] == "2026-10-01"


def test_graph_rep_limit_and_per_workout_points_are_explicit() -> None:
    client, exercise = fixture()
    path = BASE + f"exercises/{exercise.pk}/progress/"
    ordinary = client.get(
        path, {"metric": "estimated_1rm", "date_to": "2026-10-22"}
    ).json()
    extended = client.get(
        path, {"metric": "estimated_1rm", "date_to": "2026-10-22", "rep_limit": 12}
    ).json()
    assert len(ordinary["results"]) == 1
    assert Decimal(extended["results"][-1]["value"]) == Decimal("154.000")
    assert (
        client.get(
            path, {"metric": "estimated_1rm", "date_to": "2026-10-22", "rep_limit": 31}
        ).status_code
        == 400
    )
    workout = Workout.objects.create(
        user=exercise.category.user, performed_on="2026-01-01"
    )
    item = WorkoutExercise.objects.create(
        workout=workout,
        exercise=exercise,
        exercise_name="Bench",
        category_name="Chest",
        tracking_type="strength",
        weight_unit="kg",
        distance_unit="km",
    )
    WorkoutSet.objects.create(
        workout_exercise=item, weight=80, reps=5, is_completed=True
    )
    values = client.get(
        path, {"metric": "max_weight", "date_to": "2026-10-22", "per_workout": "true"}
    ).json()["results"]
    assert len(values) == 3


@pytest.mark.parametrize(
    "kind,target,achieved",
    [
        ("max_weight", "110", True),
        ("reps", "12", True),
        ("estimated_1rm", "116.667", False),
    ],
)
def test_scalar_strength_goals_are_completed_only_and_keep_unrounded_achievement(
    kind: str, target: str, achieved: bool
) -> None:
    client, exercise = fixture()
    path = BASE + f"exercises/{exercise.pk}/goals/"
    response = client.post(
        path, {"goal_type": kind, "target_value": target}, format="json"
    )
    assert response.status_code == 201
    result = client.get(path, {"date_to": "2026-10-22"}).json()[0]
    assert result["achieved"] is achieved
    assert result["source"]["set_id"]


def test_record_history_can_return_the_current_record_before_older_improvements() -> (
    None
):
    client, exercise = fixture()
    workout = Workout.objects.create(
        user=exercise.category.user, performed_on="2026-09-01"
    )
    item = WorkoutExercise.objects.create(
        workout=workout,
        exercise=exercise,
        exercise_name="Bench",
        category_name="Chest",
        tracking_type="strength",
        weight_unit="kg",
        distance_unit="km",
    )
    WorkoutSet.objects.create(
        workout_exercise=item, weight=120, reps=5, is_completed=True
    )
    values = client.get(
        BASE + f"exercises/{exercise.pk}/records/",
        {
            "date_to": "2026-10-22",
            "history": "true",
            "newest_first": "true",
            "reps": 5,
            "weight_unit": "kg",
            "distance_unit": "km",
        },
    ).json()["results"]
    assert [Decimal(row["value"]) for row in values] == [Decimal(120), Decimal(100)]


def test_cardio_total_graphs_sum_completed_sets_within_each_workout() -> None:
    client, exercise = fixture()
    workout = Workout.objects.create(
        user=exercise.category.user, performed_on="2026-10-02"
    )
    item = WorkoutExercise.objects.create(
        workout=workout,
        exercise=exercise,
        exercise_name="Run",
        category_name="Cardio",
        tracking_type="cardio",
        weight_unit="kg",
        distance_unit="km",
    )
    for distance, duration, completed in [
        (2, 600, True),
        (3, 900, True),
        (100, 9999, False),
    ]:
        WorkoutSet.objects.create(
            workout_exercise=item,
            distance=distance,
            duration_seconds=duration,
            is_completed=completed,
        )
    for metric, expected in [
        ("workout_distance", Decimal(5)),
        ("workout_duration", Decimal(1500)),
    ]:
        response = client.get(
            BASE + f"exercises/{exercise.pk}/progress/",
            {"date_to": "2026-10-22", "metric": metric},
        )
        assert response.status_code == 200
        assert Decimal(response.json()["results"][0]["value"]) == expected


def test_statistics_reject_foreign_workout_filters_and_invalid_ranges() -> None:
    client, exercise = fixture()
    other = User.objects.create_user(
        email="foreign-analytics@example.com", password="password123"
    )
    workout = Workout.objects.create(user=other, performed_on="2026-10-01")
    path = BASE + f"exercises/{exercise.pk}/stats/"
    assert (
        client.get(
            path, {"date_to": "2026-10-22", "workout_id": str(workout.pk)}
        ).status_code
        == 404
    )
    assert (
        client.get(
            path, {"date_from": "2026-11-01", "date_to": "2026-10-22"}
        ).status_code
        == 400
    )
