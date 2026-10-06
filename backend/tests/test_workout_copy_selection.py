"""Selective copy: subsets, order/snapshots, invalid selection, private atomic writes."""

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


def fixture() -> tuple[APIClient, Workout, list[WorkoutExercise]]:
    user = User.objects.create_user(email="copy@example.com", password="password-123")
    client = APIClient()
    client.force_authenticate(user)
    category = ExerciseCategory.objects.create(user=user, name="Chest")
    exercise = Exercise.objects.create(category=category, name="Bench")
    workout = Workout.objects.create(
        user=user,
        performed_on="2026-10-02",
        name="Push",
        notes="Private notes",
        is_finished=True,
    )
    items = [
        WorkoutExercise.objects.create(
            workout=workout,
            exercise=exercise,
            exercise_name="Old bench",
            category_name="Chest",
            tracking_type="strength",
            weight_unit="lb",
            distance_unit="mi",
            display_order=n * 10,
            group_name="Circuit",
            group_colour="#db2777",
        )
        for n in range(3)
    ]
    for item in items[:2]:
        for n in range(3):
            WorkoutSet.objects.create(
                workout_exercise=item,
                weight=70 + n,
                reps=5,
                display_order=n * 10,
                comment="Assisted",
                is_completed=n != 1,
            )
    return client, workout, items


def test_copy_only_selected_occurrences_and_sets_in_source_order() -> None:
    client, source, items = fixture()
    sets = list(items[0].sets.all())
    response = client.post(
        BASE + f"sessions/{source.pk}/copy/",
        {
            "performed_on": "2026-10-03",
            "selection": [
                {"item_id": str(items[2].pk), "set_ids": []},
                {
                    "item_id": str(items[0].pk),
                    "set_ids": [str(sets[2].pk), str(sets[0].pk)],
                },
            ],
        },
        format="json",
    )
    assert response.status_code == 201
    result = response.json()
    assert result["performed_on"] == "2026-10-03"
    assert result["notes"] == "" and result["is_finished"] is False
    assert len(result["exercises"]) == 2
    assert [i["display_order"] for i in result["exercises"]] == [0, 20]
    first, empty = result["exercises"]
    assert [s["weight"] for s in first["sets"]] == ["70.000", "72.000"]
    assert empty["sets"] == []
    assert first["weight_unit"] == "lb" and first["distance_unit"] == "mi"
    assert first["exercise_name"] == "Old bench"
    assert first["group_name"] == "Circuit" and first["group_colour"] == "#db2777"
    assert all(not s["is_completed"] and s["comment"] == "" for s in first["sets"])
    assert first["id"] != str(items[0].pk)
    assert items[0].sets.count() == 3 and source.notes == "Private notes"


def test_omitted_selection_and_omitted_set_ids_keep_full_copy_compatibility() -> None:
    client, source, items = fixture()
    url = BASE + f"sessions/{source.pk}/copy/"
    full = client.post(url, {"performed_on": "2026-10-03"}, format="json")
    assert full.status_code == 201
    assert [len(i["sets"]) for i in full.json()["exercises"]] == [3, 3, 0]
    partial = client.post(
        url,
        {"performed_on": "2026-10-03", "selection": [{"item_id": str(items[1].pk)}]},
        format="json",
    )
    assert partial.status_code == 201
    assert len(partial.json()["exercises"]) == 1
    assert len(partial.json()["exercises"][0]["sets"]) == 3


@pytest.mark.parametrize(
    "case",
    [
        "empty",
        "duplicate_item",
        "duplicate_set",
        "wrong_set",
        "foreign_item",
        "unknown",
        "nested_unknown",
        "null",
        "too_many",
    ],
)
def test_invalid_selections_do_not_create_partial_workouts(case: str) -> None:
    client, source, items = fixture()
    item_id = str(items[0].pk)
    set_id = str(items[0].sets.first().pk)
    bodies = {
        "empty": [],
        "duplicate_item": [{"item_id": item_id}, {"item_id": item_id}],
        "duplicate_set": [{"item_id": item_id, "set_ids": [set_id, set_id]}],
        "wrong_set": [{"item_id": item_id, "set_ids": [str(items[1].sets.first().pk)]}],
        "foreign_item": [{"item_id": "00000000-0000-0000-0000-000000000000"}],
        "nested_unknown": [{"item_id": item_id, "weight": 999}],
        "null": None,
        "too_many": [{"item_id": item_id}] * 101,
    }
    body = {
        "performed_on": "2026-10-03",
        "selection": bodies.get(case, [{"item_id": item_id}]),
    }
    if case == "unknown":
        body["user_id"] = "someone"
    count = Workout.objects.count()
    assert (
        client.post(
            BASE + f"sessions/{source.pk}/copy/", body, format="json"
        ).status_code
        == 400
    )
    assert Workout.objects.count() == count


def test_archived_catalog_snapshots_copy_and_cross_owner_sources_reject() -> None:
    client, source, items = fixture()
    exercise = items[0].exercise
    exercise.is_active = False
    exercise.tracking_type = "duration"
    exercise.weight_unit = "kg"
    exercise.save()
    url = BASE + f"sessions/{source.pk}/copy/"
    body = {"performed_on": "2026-10-03", "selection": [{"item_id": str(items[0].pk)}]}
    result = client.post(url, body, format="json")
    assert result.status_code == 201
    assert result.json()["exercises"][0]["tracking_type"] == "strength"
    assert result.json()["exercises"][0]["weight_unit"] == "lb"
    other_user = User.objects.create_user(
        email="foreign@example.com", password="password-123"
    )
    other = APIClient()
    other.force_authenticate(other_user)
    assert other.post(url, body, format="json").status_code == 404
    assert APIClient().post(url, body, format="json").status_code == 401
    # Even inconsistent raw ORM cross-owner links must not be copied.
    exercise.category.user = other_user
    exercise.category.save()
    count = Workout.objects.count()
    assert client.post(url, body, format="json").status_code == 400
    assert Workout.objects.count() == count
