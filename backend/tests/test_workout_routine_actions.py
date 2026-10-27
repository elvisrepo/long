"""Scenarios: deep copy, template-only deletion, ownership, atomic/stale ordering,
archived edit guards and preservation of independent started workouts.
"""

import pytest
from rest_framework.test import APIClient
from apps.users.models import User
from apps.workouts.models import WorkoutRoutine, RoutineDay, RoutineExercise, RoutineSet

pytestmark = pytest.mark.django_db
BASE = "/api/v1/workouts/"


def fixture() -> tuple[APIClient, dict, dict]:
    user = User.objects.create_user(
        email="routine-actions@example.test", password="password-123"
    )
    client = APIClient()
    client.force_authenticate(user)
    exercise = client.post(BASE + "catalog/initialize/", {}, format="json").json()[
        "exercises"
    ][0]
    routine = client.post(
        BASE + "routines/", {"name": "Plan", "notes": "Notes"}, format="json"
    ).json()
    day = client.post(
        BASE + f"routines/{routine['id']}/days/",
        {"name": "Push", "notes": "Instructions"},
        format="json",
    ).json()
    item = client.post(
        BASE + f"routine-days/{day['id']}/exercises/",
        {"exercise_id": exercise["id"]},
        format="json",
    ).json()
    client.patch(
        BASE + f"routine-exercises/{item['id']}/",
        {"group_name": "Superset 1", "group_colour": "#123456"},
        format="json",
    )
    client.post(
        BASE + f"routine-exercises/{item['id']}/sets/",
        {"reps": 8, "weight": None},
        format="json",
    )
    routine = client.get(BASE + "routines/").json()[0]
    return client, routine, routine["days"][0]


def test_copy_routine_clones_the_entire_plan_without_creating_workouts() -> None:
    from apps.workouts.models import Workout

    client, routine, day = fixture()
    response = client.post(
        BASE + f"routines/{routine['id']}/copy/", {"name": "Plan copy"}, format="json"
    )
    assert response.status_code == 201
    copied = response.json()
    assert copied["name"] == "Plan copy" and copied["notes"] == "Notes"
    assert copied["id"] != routine["id"]
    saved = copied["days"][0]
    assert saved["id"] != day["id"] and saved["notes"] == "Instructions"
    original = day["exercises"][0]
    item = saved["exercises"][0]
    assert (
        item["id"] != original["id"] and item["exercise_id"] == original["exercise_id"]
    )
    assert item["group_name"] == "Superset 1" and item["group_colour"] == "#123456"
    assert item["sets"][0]["id"] != original["sets"][0]["id"]
    assert item["sets"][0]["weight"] is None and item["sets"][0]["reps"] == 8
    assert Workout.objects.count() == 0


def test_delete_removes_only_templates_after_a_workout_has_started() -> None:
    from apps.workouts.models import Workout, WorkoutSet

    client, routine, day = fixture()
    started = client.post(
        BASE + f"routine-days/{day['id']}/start/",
        {"performed_on": "2026-10-23"},
        format="json",
    )
    assert started.status_code == 201
    before = list(WorkoutSet.objects.values())
    assert client.delete(BASE + f"routines/{routine['id']}/").status_code == 204
    assert not WorkoutRoutine.objects.exists()
    assert (
        not RoutineDay.objects.exists()
        and not RoutineExercise.objects.exists()
        and not RoutineSet.objects.exists()
    )
    assert Workout.objects.filter(pk=started.json()["id"]).exists()
    assert list(WorkoutSet.objects.values()) == before


@pytest.mark.parametrize("kind", ["days", "exercises"])
def test_atomic_ordering_rejects_stale_or_partial_lists(kind: str) -> None:
    client, routine, day = fixture()
    if kind == "days":
        extra = client.post(
            BASE + f"routines/{routine['id']}/days/",
            {"name": "Pull", "display_order": 200},
            format="json",
        ).json()
        ids = [day["id"], extra["id"]]
        url = BASE + f"routines/{routine['id']}/days/reorder/"
        key = "days"
    else:
        extra = client.post(
            BASE + f"routine-days/{day['id']}/exercises/",
            {"exercise_id": day["exercises"][0]["exercise_id"]},
            format="json",
        ).json()
        ids = [day["exercises"][0]["id"], extra["id"]]
        url = BASE + f"routine-days/{day['id']}/exercises/reorder/"
        key = "exercises"
    assert (
        client.post(
            url, {"ids": ids[:-1], "expected_order": ids}, format="json"
        ).status_code
        == 400
    )
    response = client.post(
        url, {"ids": list(reversed(ids)), "expected_order": ids}, format="json"
    )
    assert response.status_code == 200
    assert [row["id"] for row in response.json()[key]] == list(reversed(ids))
    assert (
        client.post(url, {"ids": ids, "expected_order": ids}, format="json").status_code
        == 409
    )


def test_routine_actions_are_private_and_duplicate_copy_names_do_not_write() -> None:
    client, routine, day = fixture()
    other = APIClient()
    assert other.delete(BASE + f"routines/{routine['id']}/").status_code == 401
    user = User.objects.create_user(
        email="other-actions@example.test", password="password-123"
    )
    other.force_authenticate(user)
    for suffix in ["copy/", "days/reorder/"]:
        assert (
            other.post(
                BASE + f"routines/{routine['id']}/" + suffix,
                {"name": "Private", "ids": [], "expected_order": []},
                format="json",
            ).status_code
            == 404
        )
    assert other.delete(BASE + f"routines/{routine['id']}/").status_code == 404
    before = RoutineDay.objects.count()
    assert (
        client.post(
            BASE + f"routines/{routine['id']}/copy/", {"name": "Plan"}, format="json"
        ).status_code
        == 400
    )
    assert RoutineDay.objects.count() == before and WorkoutRoutine.objects.count() == 1
    client.patch(
        BASE + f"routines/{routine['id']}/", {"is_active": False}, format="json"
    )
    assert (
        client.post(
            BASE + f"routines/{routine['id']}/days/reorder/",
            {"ids": [day["id"]], "expected_order": [day["id"]]},
            format="json",
        ).status_code
        == 400
    )
    response = client.post(
        BASE + f"routines/{routine['id']}/copy/",
        {"name": "Restored copy"},
        format="json",
    )
    assert response.status_code == 201 and response.json()["is_active"] is True
