"""Routine group membership and colour survive starting independent planned work."""

import pytest
from tests.test_workout_routine_actions import BASE, fixture

pytestmark = pytest.mark.django_db


def test_group_members_and_colour_copy_to_planned_workouts_independently() -> None:
    client, routine, day = fixture()
    first = day["exercises"][0]
    other_exercise = client.get(BASE + "catalog/").json()["exercises"][1]
    second = client.post(
        BASE + f"routine-days/{day['id']}/exercises/",
        {"exercise_id": other_exercise["id"]},
        format="json",
    ).json()
    assert (
        client.post(
            BASE + f"routine-exercises/{second['id']}/sets/",
            {"reps": 12},
            format="json",
        ).status_code
        == 201
    )
    for item in [first, second]:
        response = client.patch(
            BASE + f"routine-exercises/{item['id']}/",
            {"group_name": "Group 1", "group_colour": "#dc2626"},
            format="json",
        )
        assert response.status_code == 200
    started = client.post(
        BASE + f"routine-days/{day['id']}/start/",
        {"performed_on": "2026-10-26"},
        format="json",
    )
    assert started.status_code == 201
    planned = started.json()
    assert len(planned["exercises"]) == 2
    assert [
        (item["group_name"], item["group_colour"]) for item in planned["exercises"]
    ] == [("Group 1", "#dc2626"), ("Group 1", "#dc2626")]
    assert all(
        not row["is_completed"] for item in planned["exercises"] for row in item["sets"]
    )
    assert (
        client.patch(
            BASE + f"routine-exercises/{first['id']}/",
            {"group_name": ""},
            format="json",
        ).status_code
        == 200
    )
    after = client.get(BASE + f"sessions/{planned['id']}/").json()
    # The response includes a fresh server clock on each read. Compare snapshots.
    assert after["exercises"] == planned["exercises"]
