"""Scenarios: completed-only statistics, dates/owners, frozen types/units,
goals and source lifts, validation, corrections, export/deletion.
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
BASE = "/api/v1/workouts/"


def fixture(email: str = "overview@example.com") -> tuple[APIClient, Exercise]:
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


def test_statistics_count_completed_sessions_once_and_ignore_plans_and_future() -> None:
    client, exercise = fixture()
    first = logged(exercise, "2023-01-01", "70")
    WorkoutSet.objects.create(
        workout_exercise=first.workout_exercise, weight="80", reps=4
    )
    logged(exercise, "2026-10-01", "80")
    logged(exercise, "2026-10-02", "200", completed=False)
    logged(exercise, "2026-10-03", "300")
    response = client.get(
        BASE + f"exercises/{exercise.pk}/stats/", {"date_to": "2026-10-02"}
    )
    assert response.status_code == 200
    assert response.json()["groups"] == [
        {
            "tracking_type": "strength",
            "weight_unit": "kg",
            "distance_unit": "km",
            "session_count": 2,
            "set_count": 3,
            "reps_total": 14,
            "volume_total": "1070.000",
            "distance_total": None,
            "duration_seconds_total": None,
            "first_date": "2023-01-01",
            "last_date": "2026-10-01",
        }
    ]


def test_statistics_preserve_frozen_units_types_and_private_ownership() -> None:
    client, exercise = fixture()
    logged(exercise, "2026-10-01", "70")
    logged(exercise, "2026-10-01", "155", unit="lb")
    timed = logged(exercise, "2026-10-01", "0")
    timed.workout_exercise.tracking_type = "cardio"
    timed.workout_exercise.save()
    timed.weight = timed.reps = None
    timed.distance = Decimal("5")
    timed.duration_seconds = 1800
    timed.save()
    other, foreign = fixture("foreign@example.com")
    invalid = logged(exercise, "2026-10-01", "999")
    invalid.workout_exercise.workout.user = foreign.category.user
    invalid.workout_exercise.workout.save()
    exercise.tracking_type = "duration"
    exercise.is_active = False
    exercise.save()
    path = BASE + f"exercises/{exercise.pk}/stats/"
    response = client.get(path, {"date_to": "2026-10-02"})
    assert response.status_code == 200
    groups = response.json()["groups"]
    assert len(groups) == 3
    cardio = next(row for row in groups if row["tracking_type"] == "cardio")
    assert cardio["distance_total"] == "5.000"
    assert cardio["duration_seconds_total"] == 1800 and cardio["volume_total"] is None
    assert (
        next(row for row in groups if row["weight_unit"] == "lb")["volume_total"]
        == "775.000"
    )
    assert (
        next(
            row
            for row in groups
            if row["tracking_type"] == "strength" and row["weight_unit"] == "kg"
        )["volume_total"]
        == "350.000"
    )
    assert other.get(path, {"date_to": "2026-10-02"}).status_code == 404
    assert APIClient().get(path, {"date_to": "2026-10-02"}).status_code == 401
    assert client.get(path).status_code == 400
    assert client.get(path, {"date_to": "bad"}).status_code == 400
    empty = client.get(
        BASE + f"exercises/{foreign.pk}/stats/", {"date_to": "2026-10-02"}
    )
    assert empty.status_code == 404


def test_strength_goal_uses_actual_completed_lifts_with_explicit_rep_rule() -> None:
    client, exercise = fixture()
    logged(exercise, "2026-10-01", "95")
    achieved = logged(exercise, "2026-10-02", "100", reps=6)
    logged(exercise, "2026-10-02", "200", completed=False)
    path = BASE + f"exercises/{exercise.pk}/goals/"
    created = client.post(
        path,
        {"target_weight": "100", "target_reps": 5, "rep_rule": "at_least"},
        format="json",
    )
    assert created.status_code == 201
    response = client.get(path, {"date_to": "2026-10-02"})
    assert response.status_code == 200
    goal = response.json()[0]
    assert goal["achieved"] is True
    assert goal["best_weight"] == "100.000"
    assert goal["source"]["set_id"] == str(achieved.pk)
    assert goal["source"]["reps"] == 6
    earlier = client.get(path, {"date_to": "2026-10-01"}).json()[0]
    assert earlier["achieved"] is False and earlier["best_weight"] == "95.000"


def test_goal_edits_deletions_and_unit_changes_do_not_reinterpret_history() -> None:
    client, exercise = fixture()
    logged(exercise, "2026-10-01", "95")
    strongest = logged(exercise, "2026-10-02", "100", reps=6)
    logged(exercise, "2026-10-02", "200", unit="lb")
    logged(exercise, "2026-10-03", "300")
    path = BASE + f"exercises/{exercise.pk}/goals/"
    goal_id = client.post(
        path, {"target_weight": "100", "target_reps": 5}, format="json"
    ).json()["id"]
    detail = BASE + f"goals/{goal_id}/"
    exercise.weight_unit = "lb"
    exercise.tracking_type = "duration"
    exercise.is_active = False
    exercise.save()
    assert client.get(path, {"date_to": "2026-10-02"}).json()[0]["weight_unit"] == "kg"
    assert client.patch(detail, {"weight_unit": "lb"}, format="json").status_code == 400
    assert client.patch(detail, {"rep_rule": "exact"}, format="json").status_code == 200
    assert (
        client.get(path, {"date_to": "2026-10-02"}).json()[0]["best_weight"] == "95.000"
    )
    assert (
        client.patch(detail, {"rep_rule": "at_least"}, format="json").status_code == 200
    )
    assert (
        client.patch(
            BASE + f"sets/{strongest.pk}/", {"is_completed": False}, format="json"
        ).status_code
        == 200
    )
    goal = client.get(path, {"date_to": "2026-10-02"}).json()[0]
    assert goal["achieved"] is False and goal["best_weight"] == "95.000"
    assert client.delete(BASE + f"sets/{strongest.pk}/").status_code == 204
    assert (
        client.get(path, {"date_to": "2026-10-02"}).json()[0]["best_weight"] == "95.000"
    )
    assert (
        client.patch(detail, {"target_weight": "95"}, format="json").status_code == 200
    )
    assert client.get(path, {"date_to": "2026-10-02"}).json()[0]["achieved"] is True
    other, _ = fixture("foreign@example.com")
    assert other.get(path, {"date_to": "2026-10-02"}).status_code == 404
    assert other.patch(detail, {"target_weight": "1"}, format="json").status_code == 404
    assert other.delete(detail).status_code == 404
    assert APIClient().get(path, {"date_to": "2026-10-02"}).status_code == 401
    assert client.delete(detail).status_code == 204
    assert client.get(path, {"date_to": "2026-10-02"}).json() == []


def test_goal_export_and_account_deletion_are_owner_scoped() -> None:
    import json
    from apps.users.account import account_export, delete_account
    from apps.workouts.models import ExerciseGoal

    client, exercise = fixture()
    other, foreign = fixture("foreign@example.com")
    for owner, item in [(client, exercise), (other, foreign)]:
        assert (
            owner.post(
                BASE + f"exercises/{item.pk}/goals/",
                {"target_weight": "100", "target_reps": 5},
                format="json",
            ).status_code
            == 201
        )
    data = json.loads("".join(account_export(exercise.category.user)))
    assert len(data["exercise_goals"]) == 1
    assert data["exercise_goals"][0]["exercise_id"] == str(exercise.pk)
    delete_account(user=exercise.category.user, password="password-123")
    assert ExerciseGoal.objects.count() == 1
    assert ExerciseGoal.objects.get().exercise_id == foreign.pk


@pytest.mark.parametrize(
    "payload",
    [
        {"target_weight": "0", "target_reps": 5},
        {"target_weight": "10001", "target_reps": 5},
        {"target_weight": "100", "target_reps": 0},
        {"target_weight": "100", "target_reps": 10001},
        {"target_weight": "100", "target_reps": 5, "rep_rule": "bad"},
        {"target_weight": "100", "target_reps": 5, "weight_unit": "lb"},
    ],
)
def test_goals_validate_targets_before_creating_rows(
    payload: dict[str, object],
) -> None:
    from apps.workouts.models import ExerciseGoal

    client, exercise = fixture()
    assert (
        client.post(
            BASE + f"exercises/{exercise.pk}/goals/", payload, format="json"
        ).status_code
        == 400
    )
    assert not ExerciseGoal.objects.exists()


def test_goal_creation_is_bounded_and_absent_qualifying_lifts_are_not_fabricated() -> (
    None
):
    from apps.workouts.models import ExerciseGoal

    client, exercise = fixture()
    path = BASE + f"exercises/{exercise.pk}/goals/"
    logged(exercise, "2026-10-01", "150", reps=4)
    logged(exercise, "2026-10-01", "200", completed=False)
    logged(exercise, "2026-10-01", "100", unit="lb")
    for _ in range(20):
        ExerciseGoal.objects.create(
            exercise=exercise,
            target_weight="100",
            target_reps=5,
            weight_unit="kg",
            distance_unit="km",
        )
    assert (
        client.post(
            path, {"target_weight": "100", "target_reps": 5}, format="json"
        ).status_code
        == 400
    )
    result = client.get(path, {"date_to": "2026-10-02"})
    assert result.status_code == 200 and len(result.json()) == 20
    assert all(
        row["source"] is None
        and row["best_weight"] is None
        and row["achieved"] is False
        and row["progress_percent"] == "0.0"
        for row in result.json()
    )
    assert client.get(path).status_code == 400
    assert client.get(path, {"date_to": "bad"}).status_code == 400
    assert ExerciseGoal.objects.count() == 20


@pytest.mark.parametrize("change", ["type", "exercise_archive", "category_archive"])
def test_goal_creation_requires_an_active_strength_catalog_entry(change: str) -> None:
    client, exercise = fixture()
    if change == "type":
        exercise.tracking_type = "bodyweight"
    elif change == "exercise_archive":
        exercise.is_active = False
    else:
        exercise.category.is_active = False
        exercise.category.save()
    exercise.save()
    assert (
        client.post(
            BASE + f"exercises/{exercise.pk}/goals/",
            {"target_weight": "100", "target_reps": 5},
            format="json",
        ).status_code
        == 400
    )


@pytest.mark.parametrize(
    "tracking_type,reps,seconds", [("bodyweight", 8, None), ("duration", None, 120)]
)
def test_statistics_do_not_assign_strength_volume_to_other_exercise_types(
    tracking_type: str, reps: int | None, seconds: int | None
) -> None:
    client, exercise = fixture()
    saved = logged(exercise, "2026-10-01", "0")
    saved.workout_exercise.tracking_type = tracking_type
    saved.workout_exercise.save()
    saved.weight = None
    saved.reps = reps
    saved.duration_seconds = seconds
    saved.save()
    row = client.get(
        BASE + f"exercises/{exercise.pk}/stats/", {"date_to": "2026-10-02"}
    ).json()["groups"][0]
    assert row["volume_total"] is None and row["distance_total"] is None
    assert row["reps_total"] == reps and row["duration_seconds_total"] == seconds
