"""Scenarios: all-time summaries, owners, frozen units/types, plans, metrics,
source/ties, pagination, PR history, edits/deletion and strict query validation.
"""

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


def catalog(email: str = "progress@example.com") -> tuple[APIClient, Exercise]:
    user = User.objects.create_user(email=email, password="password-123")
    client = APIClient()
    client.force_authenticate(user)
    category = ExerciseCategory.objects.create(user=user, name="Chest")
    return client, Exercise.objects.create(
        category=category, name="Bench", tracking_type="strength"
    )


def logged(
    exercise: Exercise,
    day: str,
    weight: str,
    reps: int = 5,
    completed: bool = True,
    unit: str = "kg",
) -> WorkoutSet:
    workout = Workout.objects.create(user=exercise.category.user, performed_on=day)
    item = WorkoutExercise.objects.create(
        workout=workout,
        exercise=exercise,
        exercise_name="Bench",
        category_name="Chest",
        tracking_type="strength",
        weight_unit=unit,
        distance_unit="km",
    )
    return WorkoutSet.objects.create(
        workout_exercise=item, weight=Decimal(weight), reps=reps, is_completed=completed
    )


def url(exercise: Exercise, action: str = "progress") -> str:
    return f"/api/v1/workouts/exercises/{exercise.pk}/{action}/"


def test_all_time_progress_aggregates_completed_days_without_a_366_day_limit() -> None:
    client, exercise = catalog()
    logged(exercise, "2023-01-01", "40")
    logged(exercise, "2026-10-01", "70")
    logged(exercise, "2026-10-01", "80")
    logged(exercise, "2026-10-02", "200", completed=False)
    logged(exercise, "2026-10-03", "300")
    response = client.get(
        url(exercise), {"metric": "max_weight", "date_to": "2026-10-02"}
    )
    assert response.status_code == 200
    assert response.json()["count"] == 2
    assert [
        (row["date"], Decimal(row["value"])) for row in response.json()["results"]
    ] == [("2023-01-01", Decimal(40)), ("2026-10-01", Decimal(80))]


def test_all_time_records_are_per_rep_and_unit_with_the_original_source_on_ties() -> (
    None
):
    client, exercise = catalog()
    first = logged(exercise, "2023-01-01", "70")
    logged(exercise, "2026-10-01", "70")
    logged(exercise, "2026-10-01", "90", reps=1)
    logged(exercise, "2026-10-01", "155", unit="lb")
    logged(exercise, "2026-10-01", "999", completed=False)
    response = client.get(url(exercise, "records"), {"date_to": "2026-10-02"})
    assert response.status_code == 200
    records = response.json()["results"]
    assert len(records) == 3
    best = next(
        row for row in records if row["weight_unit"] == "kg" and row["reps"] == 5
    )
    assert Decimal(best["value"]) == 70
    assert best["date"] == "2023-01-01"
    assert best["source"]["set_id"] == str(first.pk)
    assert best["source"]["item_id"] == str(first.workout_exercise_id)
    assert best["source"]["workout_id"] == str(first.workout_exercise.workout_id)


def test_record_history_returns_only_strict_improvements_and_paginates() -> None:
    client, exercise = catalog()
    for day, weight in [
        ("2023-01-01", "60"),
        ("2023-02-01", "70"),
        ("2024-01-01", "65"),
        ("2024-02-01", "70"),
        ("2026-10-01", "80"),
    ]:
        logged(exercise, day, weight)
    logged(exercise, "2024-03-01", "155", unit="lb")
    response = client.get(
        url(exercise, "records"),
        {
            "date_to": "2026-10-02",
            "history": "true",
            "reps": 5,
            "weight_unit": "kg",
            "distance_unit": "km",
            "limit": 2,
        },
    )
    assert response.status_code == 200
    assert response.json()["count"] == 3
    assert [Decimal(row["value"]) for row in response.json()["results"]] == [60, 70]
    assert response.json()["next"] is not None
    second = client.get(
        url(exercise, "records"),
        {
            "date_to": "2026-10-02",
            "history": "true",
            "reps": 5,
            "weight_unit": "kg",
            "distance_unit": "km",
            "limit": 2,
            "offset": 2,
        },
    )
    assert [Decimal(row["value"]) for row in second.json()["results"]] == [80]


def test_estimated_max_summary_uses_the_1_to_10_rep_rule_and_winning_source() -> None:
    client, exercise = catalog()
    first = logged(exercise, "2023-01-01", "60", reps=10)
    logged(exercise, "2023-01-01", "70", reps=1)
    logged(exercise, "2023-01-01", "200", reps=11)
    response = client.get(
        url(exercise), {"metric": "estimated_1rm", "date_to": "2026-10-02"}
    )
    assert response.status_code == 200
    point = response.json()["results"][0]
    assert Decimal(point["value"]) == 80
    assert point["source"]["set_id"] == str(first.pk)
    assert point["source"]["weight"] == "60.000"
    assert point["source"]["reps"] == 10


def test_graph_metrics_distinguish_max_sets_from_per_workout_totals() -> None:
    client, exercise = catalog()
    first = logged(exercise, "2026-10-01", "60", reps=10)
    item = first.workout_exercise
    WorkoutSet.objects.create(workout_exercise=item, weight=80, reps=5)
    duplicate = WorkoutExercise.objects.create(
        workout=item.workout,
        exercise=exercise,
        exercise_name="Bench",
        category_name="Chest",
        tracking_type="strength",
        weight_unit="kg",
        distance_unit="km",
    )
    WorkoutSet.objects.create(workout_exercise=duplicate, weight=50, reps=2)
    logged(exercise, "2026-10-01", "40", reps=5)
    for metric, expected in [
        ("max_reps", [10]),
        ("max_volume", [600]),
        ("max_weight_reps", [80]),
        ("workout_volume", [1100, 200]),
        ("workout_reps", [17, 5]),
    ]:
        response = client.get(
            url(exercise), {"metric": metric, "date_to": "2026-10-02", "reps": 5}
        )
        assert response.status_code == 200, metric
        assert sorted(
            Decimal(row["value"]) for row in response.json()["results"]
        ) == sorted(expected), metric


def test_summaries_are_private_paginated_and_keep_archived_history() -> None:
    client, exercise = catalog()
    other, foreign = catalog("other-progress@example.com")
    logged(exercise, "2023-01-01", "40")
    logged(exercise, "2026-10-01", "80")
    stolen = logged(foreign, "2026-10-01", "999")
    WorkoutExercise.objects.filter(pk=stolen.workout_exercise_id).update(
        exercise=exercise
    )
    Exercise.objects.filter(pk=exercise.pk).update(is_active=False)
    for action in ("progress", "records"):
        assert (
            other.get(url(exercise, action), {"date_to": "2026-10-02"}).status_code
            == 404
        )
        assert (
            APIClient()
            .get(url(exercise, action), {"date_to": "2026-10-02"})
            .status_code
            == 401
        )
    first = client.get(url(exercise), {"date_to": "2026-10-02", "limit": 1}).json()
    assert first["count"] == 2 and len(first["results"]) == 1 and first["next"]
    second = client.get(
        url(exercise), {"date_to": "2026-10-02", "limit": 1, "offset": 1}
    ).json()
    assert Decimal(second["results"][0]["value"]) == 80


def test_records_recompute_after_completion_edits_and_deletion() -> None:
    client, exercise = catalog()
    first = logged(exercise, "2023-01-01", "60")
    best = logged(exercise, "2026-10-01", "80")
    best.weight = Decimal(50)
    best.save()
    assert (
        Decimal(
            client.get(url(exercise, "records"), {"date_to": "2026-10-02"}).json()[
                "results"
            ][0]["value"]
        )
        == 60
    )
    first.delete()
    assert (
        Decimal(
            client.get(url(exercise, "records"), {"date_to": "2026-10-02"}).json()[
                "results"
            ][0]["value"]
        )
        == 50
    )
    best.is_completed = False
    best.save()
    assert (
        client.get(url(exercise, "records"), {"date_to": "2026-10-02"}).json()["count"]
        == 0
    )


def test_cardio_and_bodyweight_summaries_use_frozen_measures() -> None:
    client, exercise = catalog()
    row = logged(exercise, "2023-01-01", "0")
    WorkoutExercise.objects.filter(pk=row.workout_exercise_id).update(
        tracking_type="cardio"
    )
    row.weight = None
    row.reps = None
    row.distance = Decimal("3.5")
    row.duration_seconds = 1200
    row.save()
    for metric, value in [("max_distance", Decimal("3.5")), ("max_duration", 1200)]:
        response = client.get(
            url(exercise), {"metric": metric, "date_to": "2026-10-02"}
        )
        assert response.status_code == 200
        assert response.json()["types"] == ["cardio"]
        assert Decimal(response.json()["results"][0]["value"]) == value
    assert (
        client.get(url(exercise, "records"), {"date_to": "2026-10-02"}).json()["count"]
        == 0
    )
    WorkoutExercise.objects.filter(pk=row.workout_exercise_id).update(
        tracking_type="bodyweight"
    )
    row.distance = None
    row.duration_seconds = None
    row.reps = 10
    row.save()
    assert (
        client.get(
            url(exercise), {"metric": "estimated_1rm", "date_to": "2026-10-02"}
        ).json()["count"]
        == 0
    )
    assert (
        Decimal(
            client.get(
                url(exercise), {"metric": "workout_reps", "date_to": "2026-10-02"}
            ).json()["results"][0]["value"]
        )
        == 10
    )


@pytest.mark.parametrize(
    "action,query",
    [
        ("progress", {}),
        ("progress", {"date_to": "bad"}),
        ("progress", {"metric": "unknown"}),
        ("progress", {"reps": 0}),
        ("records", {"history": "nonsense"}),
        ("records", {"weight_unit": "stone"}),
        ("progress", {"limit": 0}),
        ("records", {"limit": 501}),
        ("progress", {"offset": -1}),
    ],
)
def test_summary_query_parameters_are_validated(
    action: str, query: dict[str, object]
) -> None:
    client, exercise = catalog()
    parameters = {"date_to": "2026-10-02", **query} if query else query
    assert client.get(url(exercise, action), parameters).status_code == 400
