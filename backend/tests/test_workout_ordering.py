"""Scenarios: adjacent moves, ties/boundaries, preservation, auth and closed sessions."""

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
    user = User.objects.create_user(
        email="ordering@example.com", password="password-123"
    )
    client = APIClient()
    client.force_authenticate(user)
    category = ExerciseCategory.objects.create(user=user, name="Back")
    exercise = Exercise.objects.create(category=category, name="Row")
    workout = Workout.objects.create(user=user, performed_on="2026-10-02")
    items = [
        WorkoutExercise.objects.create(
            workout=workout,
            exercise=exercise,
            exercise_name=f"Row {n}",
            category_name="Back",
            tracking_type="strength",
            display_order=n * 10,
        )
        for n in range(1, 4)
    ]
    return client, workout, items


def test_move_exercise_up_persists_adjacent_order() -> None:
    client, workout, items = fixture()
    workout.exercises.update(group_name="Circuit", group_colour="#db2777")
    before = list(
        workout.exercises.values(
            "id",
            "exercise_id",
            "exercise_name",
            "tracking_type",
            "weight_unit",
            "distance_unit",
            "group_name",
            "group_colour",
        )
    )
    response = client.post(
        BASE + f"session-exercises/{items[2].pk}/move/",
        {"direction": "up"},
        format="json",
    )
    assert response.status_code == 200
    expected = [str(items[n].pk) for n in (0, 2, 1)]
    assert [i["id"] for i in response.json()["exercises"]] == expected
    saved = client.get(BASE + f"sessions/{workout.pk}/").json()
    assert [i["id"] for i in saved["exercises"]] == expected
    after = list(
        workout.exercises.values(
            "id",
            "exercise_id",
            "exercise_name",
            "tracking_type",
            "weight_unit",
            "distance_unit",
            "group_name",
            "group_colour",
        )
    )
    assert sorted(before, key=lambda row: row["id"]) == sorted(
        after, key=lambda row: row["id"]
    )


def test_move_set_down_with_ties_preserves_all_performance_fields() -> None:
    client, workout, items = fixture()
    sets = [
        WorkoutSet.objects.create(
            workout_exercise=items[0],
            display_order=10,
            weight=70 + n,
            reps=5,
            comment=f"Note {n}",
            is_completed=n != 1,
        )
        for n in range(3)
    ]
    sets.sort(key=lambda s: str(s.pk))
    before = {s.pk: (s.weight, s.reps, s.comment, s.is_completed) for s in sets}
    response = client.post(
        BASE + f"sets/{sets[0].pk}/move/",
        {"direction": "down"},
        format="json",
    )
    assert response.status_code == 200
    expected = [str(sets[n].pk) for n in (1, 0, 2)]
    assert [s["id"] for s in response.json()["exercises"][0]["sets"]] == expected
    saved = client.get(BASE + f"sessions/{workout.pk}/").json()
    assert [s["id"] for s in saved["exercises"][0]["sets"]] == expected
    for s in sets:
        s.refresh_from_db()
        assert (s.weight, s.reps, s.comment, s.is_completed) == before[s.pk]


@pytest.mark.parametrize("kind", ["session-exercises", "sets"])
@pytest.mark.parametrize("direction", ["up", "down"])
def test_move_boundaries_are_no_ops_and_other_direction_works(
    kind: str, direction: str
) -> None:
    client, workout, items = fixture()
    rows = (
        items
        if kind == "session-exercises"
        else [
            WorkoutSet.objects.create(
                workout_exercise=items[0], display_order=n * 10, weight=70, reps=5
            )
            for n in range(3)
        ]
    )
    target = rows[0] if direction == "up" else rows[-1]
    orders = [r.display_order for r in rows]
    url = BASE + f"{kind}/{target.pk}/move/"
    assert client.post(url, {"direction": direction}, format="json").status_code == 200
    for row, order in zip(rows, orders):
        row.refresh_from_db()
        assert row.display_order == order
    opposite = "down" if direction == "up" else "up"
    assert client.post(url, {"direction": opposite}, format="json").status_code == 200
    for row in rows:
        row.refresh_from_db()
    expected = (
        [rows[1], rows[0], rows[2]]
        if direction == "up"
        else [rows[0], rows[2], rows[1]]
    )
    assert sorted(rows, key=lambda r: r.display_order) == expected


@pytest.mark.parametrize("kind", ["session-exercises", "sets"])
def test_moves_validate_auth_owner_and_finished_state(kind: str) -> None:
    client, workout, items = fixture()
    row = (
        items[1]
        if kind == "session-exercises"
        else WorkoutSet.objects.create(
            workout_exercise=items[0],
            weight=70,
            reps=5,
        )
    )
    url = BASE + f"{kind}/{row.pk}/move/"
    assert APIClient().post(url, {"direction": "up"}, format="json").status_code == 401
    foreign = User.objects.create_user(
        email="foreign@example.com", password="password-123"
    )
    other = APIClient()
    other.force_authenticate(foreign)
    assert other.post(url, {"direction": "up"}, format="json").status_code == 404
    for body in ({}, {"direction": "left"}, {"direction": "up", "display_order": 1}):
        assert client.post(url, body, format="json").status_code == 400
    workout.is_finished = True
    workout.save()
    assert client.post(url, {"direction": "up"}, format="json").status_code == 400
    workout.is_finished = False
    workout.save()
    assert client.post(url, {"direction": "up"}, format="json").status_code == 200
