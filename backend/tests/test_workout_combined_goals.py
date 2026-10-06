"""Test list: same-set conjunction, partial progress, bounds, frozen snapshots,
ownership, corrections, lifecycle, SQL shape and preserving existing goals.
"""

from decimal import Decimal
from typing import Any
import json

from django.db import IntegrityError, transaction
from rest_framework.test import APIClient

from apps.workouts.models import ExerciseGoal, WorkoutSet

import pytest

from tests.test_workout_metric_goals import BASE, fixture, logged

pytestmark = pytest.mark.django_db
TARGET = {
    "goal_type": "distance_time",
    "target_distance": "5.000",
    "target_duration_seconds": 1500,
}


def test_combined_goal_requires_both_conditions_in_the_same_completed_set() -> None:
    client, exercise = fixture()
    path = BASE + f"exercises/{exercise.pk}/goals/"
    supported = logged(exercise, distance="5", duration_seconds=1500, is_completed=True)
    created = client.post(path, TARGET, format="json")
    assert created.status_code == 201
    assert created.json()["target_distance"] == "5.000"
    assert created.json()["target_duration_seconds"] == 1500
    assert created.json()["target_value"] is None
    result = client.get(path, {"date_to": "2026-10-05"}).json()[0]
    assert result["achieved"] is True
    assert result["progress_percent"] == "100.0"
    assert result["best_value"] is None and result["best_weight"] is None
    assert result["source"]["set_id"] == str(supported.pk)
    assert Decimal(result["source"]["distance"]) == 5
    assert result["source"]["duration_seconds"] == 1500


def test_progress_uses_one_sets_weaker_condition_not_two_separate_bests() -> None:
    client, exercise = fixture()
    short = logged(exercise, distance="4", duration_seconds=1200, is_completed=True)
    slow = logged(exercise, distance="6", duration_seconds=1800, is_completed=True)
    path = BASE + f"exercises/{exercise.pk}/goals/"
    assert client.post(path, TARGET, format="json").status_code == 201
    result = client.get(path, {"date_to": "2026-10-05"}).json()[0]
    assert result["achieved"] is False
    assert result["progress_percent"] == "83.3"
    assert result["source"]["set_id"] == str(slow.pk)
    slow.delete()
    result = client.get(path, {"date_to": "2026-10-05"}).json()[0]
    assert result["progress_percent"] == "80.0"
    assert result["source"]["set_id"] == str(short.pk)


@pytest.mark.parametrize(
    "distance,seconds,achieved,percent",
    [
        ("5", 1500, True, "100.0"),
        ("5.001", 1499, True, "100.0"),
        ("4.999", 1500, False, "99.9"),
        ("5", 1501, False, "99.9"),
        ("10", 3000, False, "50.0"),
    ],
)
def test_raw_boundaries_and_no_pace_extrapolation(
    distance: str, seconds: int, achieved: bool, percent: str
) -> None:
    client, exercise = fixture()
    logged(exercise, distance=distance, duration_seconds=seconds, is_completed=True)
    path = BASE + f"exercises/{exercise.pk}/goals/"
    assert client.post(path, TARGET, format="json").status_code == 201
    result = client.get(path, {"date_to": "2026-10-05"}).json()[0]
    assert result["achieved"] is achieved
    assert result["progress_percent"] == percent


def test_ineligible_rows_do_not_count_and_ties_use_earliest_stable_source() -> None:
    client, exercise = fixture()
    logged(exercise, distance="10", duration_seconds=1, is_completed=False)
    logged(exercise, "2026-10-06", distance="10", duration_seconds=1, is_completed=True)
    for fields in [{"distance": "10"}, {"duration_seconds": 1}]:
        logged(exercise, is_completed=True, **fields)
    with pytest.raises(IntegrityError), transaction.atomic():
        logged(exercise, distance="10", duration_seconds=0, is_completed=True)
    path = BASE + f"exercises/{exercise.pk}/goals/"
    assert client.post(path, TARGET, format="json").status_code == 201
    empty = client.get(path, {"date_to": "2026-10-05"}).json()[0]
    assert not empty["achieved"] and empty["source"] is None
    assert empty["progress_percent"] == "0.0"
    first = logged(
        exercise, "2026-10-04", distance="5", duration_seconds=1500, is_completed=True
    )
    logged(exercise, distance="5", duration_seconds=1500, is_completed=True)
    result = client.get(path, {"date_to": "2026-10-05"}).json()[0]
    assert result["source"]["set_id"] == str(first.pk)


@pytest.mark.parametrize(
    "changes",
    [
        {"target_distance": None},
        {"target_distance": "0"},
        {"target_distance": "100001"},
        {"target_distance": "1.0001"},
        {"target_duration_seconds": None},
        {"target_duration_seconds": 0},
        {"target_duration_seconds": 604801},
        {"target_duration_seconds": 1.5},
        {"target_value": "5"},
        {"target_reps": 5},
        {"tracking_type": "cardio"},
        {"distance_unit": "mi"},
        {"unexpected": 1},
    ],
)
def test_invalid_combined_targets_and_shape_do_not_create_or_patch(
    changes: dict[str, Any],
) -> None:
    client, exercise = fixture()
    path = BASE + f"exercises/{exercise.pk}/goals/"
    assert client.post(path, {**TARGET, **changes}, format="json").status_code == 400
    assert not exercise.goals.exists()
    goal = client.post(path, TARGET, format="json").json()
    assert (
        client.patch(BASE + f"goals/{goal['id']}/", changes, format="json").status_code
        == 400
    )
    saved = exercise.goals.get()
    assert saved.target_distance == 5 and saved.target_duration_seconds == 1500


def test_both_targets_required_on_creation_and_partial_edits_recompute() -> None:
    client, exercise = fixture()
    logged(exercise, distance="5", duration_seconds=1800, is_completed=True)
    path = BASE + f"exercises/{exercise.pk}/goals/"
    for missing in ["target_distance", "target_duration_seconds"]:
        assert (
            client.post(
                path, {k: v for k, v in TARGET.items() if k != missing}, format="json"
            ).status_code
            == 400
        )
    goal = client.post(path, TARGET, format="json").json()
    detail = BASE + f"goals/{goal['id']}/"
    assert client.patch(detail, {}, format="json").status_code == 400
    assert not client.get(path, {"date_to": "2026-10-05"}).json()[0]["achieved"]
    response = client.patch(detail, {"target_duration_seconds": 1800}, format="json")
    assert response.status_code == 200 and response.json()["target_distance"] == "5.000"
    assert client.get(path, {"date_to": "2026-10-05"}).json()[0]["achieved"]
    assert (
        client.patch(detail, {"target_distance": "6"}, format="json").status_code == 200
    )
    assert not client.get(path, {"date_to": "2026-10-05"}).json()[0]["achieved"]


def test_frozen_partition_foreign_history_and_archived_editing() -> None:
    client, exercise = fixture()
    supported = logged(exercise, distance="5", duration_seconds=1500, is_completed=True)
    other, foreign = fixture(email="combined-foreign@example.com")
    for field, value in [
        ("tracking_type", "strength"),
        ("distance_unit", "mi"),
        ("weight_unit", "lb"),
    ]:
        mismatch = logged(
            exercise, distance="100", duration_seconds=1, is_completed=True
        )
        setattr(mismatch.workout_exercise, field, value)
        mismatch.workout_exercise.save()
    invalid = logged(exercise, distance="100", duration_seconds=1, is_completed=True)
    invalid.workout_exercise.workout.user = foreign.category.user
    invalid.workout_exercise.workout.save()
    path = BASE + f"exercises/{exercise.pk}/goals/"
    created = client.post(path, TARGET, format="json").json()
    detail = BASE + f"goals/{created['id']}/"
    assert other.get(path, {"date_to": "2026-10-05"}).status_code == 404
    assert (
        other.patch(detail, {"target_distance": "4"}, format="json").status_code == 404
    )
    assert other.delete(detail).status_code == 404
    assert APIClient().get(path, {"date_to": "2026-10-05"}).status_code == 401
    assert APIClient().post(path, TARGET, format="json").status_code == 401
    exercise.tracking_type = "strength"
    exercise.distance_unit = "mi"
    exercise.is_active = False
    exercise.save()
    exercise.category.is_active = False
    exercise.category.save()
    result = client.get(path, {"date_to": "2026-10-05"}).json()[0]
    assert result["source"]["set_id"] == str(supported.pk)
    assert result["distance_unit"] == "km" and result["tracking_type"] == "cardio"
    assert (
        client.patch(
            detail, {"target_duration_seconds": 1600}, format="json"
        ).status_code
        == 200
    )
    assert (
        client.patch(detail, {"goal_type": "duration"}, format="json").status_code
        == 400
    )
    assert client.post(path, TARGET, format="json").status_code == 400
    supported.is_completed = False
    supported.save()
    result = client.get(path, {"date_to": "2026-10-05"}).json()[0]
    assert not result["achieved"] and result["source"] is None


def test_goal_deletion_export_and_account_cascade_keep_other_accounts_isolated() -> (
    None
):
    client, exercise = fixture()
    other, foreign = fixture(email="combined-export-foreign@example.com")
    saved = logged(exercise, distance="5", duration_seconds=1500, is_completed=True)
    other_goal = other.post(
        BASE + f"exercises/{foreign.pk}/goals/", TARGET, format="json"
    ).json()
    path = BASE + f"exercises/{exercise.pk}/goals/"
    goal = client.post(path, TARGET, format="json").json()
    response = client.get("/api/v1/me/export/")
    exported = json.loads(b"".join(response.streaming_content))["exercise_goals"]
    assert len(exported) == 1
    assert exported[0]["id"] == goal["id"]
    assert Decimal(exported[0]["target_distance"]) == 5
    assert exported[0]["target_duration_seconds"] == 1500
    assert client.delete(BASE + f"goals/{goal['id']}/").status_code == 204
    assert WorkoutSet.objects.filter(pk=saved.pk).exists()
    assert client.post(path, TARGET, format="json").status_code == 201
    exercise.category.user.delete()
    assert not WorkoutSet.objects.filter(pk=saved.pk).exists()
    assert ExerciseGoal.objects.filter(pk=other_goal["id"]).exists()


@pytest.mark.parametrize("kind", ["strength", "bodyweight", "duration"])
def test_combined_goals_are_cardio_only(kind: str) -> None:
    client, exercise = fixture(kind)
    assert (
        client.post(
            BASE + f"exercises/{exercise.pk}/goals/", TARGET, format="json"
        ).status_code
        == 400
    )
    assert not exercise.goals.exists()


@pytest.mark.parametrize(
    "fields",
    [
        {"target_distance": None},
        {"target_duration_seconds": None},
        {"target_distance": "0"},
        {"target_duration_seconds": 0},
        {"target_distance": "100001"},
        {"target_duration_seconds": 604801},
        {"target_value": "5"},
        {"target_weight": "1"},
        {"target_reps": 1},
        {"tracking_type": "strength"},
        {"goal_type": "distance"},
    ],
)
def test_sql_rejects_invalid_combined_shapes(fields: dict[str, Any]) -> None:
    _, exercise = fixture()
    values = {
        **TARGET,
        "exercise": exercise,
        "tracking_type": "cardio",
        "weight_unit": "kg",
        "distance_unit": "km",
        **fields,
    }
    with pytest.raises(IntegrityError), transaction.atomic():
        ExerciseGoal.objects.create(**values)


def test_goals_share_existing_cap_and_do_not_change_logged_values() -> None:
    client, exercise = fixture()
    saved = logged(exercise, distance="5", duration_seconds=1500, is_completed=True)
    path = BASE + f"exercises/{exercise.pk}/goals/"
    for _ in range(20):
        assert client.post(path, TARGET, format="json").status_code == 201
    assert client.post(path, TARGET, format="json").status_code == 400
    saved.refresh_from_db()
    assert saved.distance == 5 and saved.duration_seconds == 1500
