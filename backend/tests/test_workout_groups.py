"""Group scenarios: atomic membership, colours, rename, unlink/delete,
owner/session boundaries, finished sessions, and independent copies/templates.
"""

import pytest
from rest_framework.test import APIClient

from apps.users.models import User

pytestmark = pytest.mark.django_db
BASE = "/api/v1/workouts/"


def group_fixture(email: str = "groups@example.com") -> tuple[APIClient, dict, list]:
    user = User.objects.create_user(email=email, password="password-123")
    client = APIClient()
    client.force_authenticate(user)
    catalog = client.post(BASE + "catalog/initialize/", {}, format="json").json()
    workout = client.post(
        BASE + "sessions/", {"performed_on": "2026-10-02"}, format="json"
    ).json()
    items = [
        client.post(
            BASE + f"sessions/{workout['id']}/exercises/",
            {"exercise_id": exercise["id"]},
            format="json",
        ).json()
        for exercise in catalog["exercises"][:3]
    ]
    return client, workout, items


def test_group_save_replaces_membership_and_colour_atomically() -> None:
    client, workout, items = group_fixture()
    response = client.put(
        BASE + f"sessions/{workout['id']}/groups/",
        {
            "name": " Superset 1 ",
            "colour": "#DB2777",
            "member_ids": [items[0]["id"], items[2]["id"]],
        },
        format="json",
    )
    assert response.status_code == 200
    saved = {item["id"]: item for item in response.json()["exercises"]}
    assert saved[items[0]["id"]]["group_name"] == "Superset 1"
    assert saved[items[2]["id"]]["group_colour"] == "#db2777"
    assert saved[items[1]["id"]]["group_name"] == ""


def test_rename_remove_member_and_delete_group_preserve_exercises_and_sets() -> None:
    client, workout, items = group_fixture()
    url = BASE + f"sessions/{workout['id']}/groups/"
    client.post(
        BASE + f"session-exercises/{items[0]['id']}/sets/",
        {"is_completed": False},
        format="json",
    )
    assert (
        client.put(
            url,
            {
                "name": "Superset 1",
                "colour": "#007f68",
                "member_ids": [item["id"] for item in items],
            },
            format="json",
        ).status_code
        == 200
    )
    response = client.put(
        url,
        {
            "original_name": "Superset 1",
            "name": "Pull",
            "colour": "#2563eb",
            "member_ids": [items[1]["id"], items[2]["id"]],
        },
        format="json",
    )
    assert response.status_code == 200
    saved = response.json()["exercises"]
    assert [item["group_name"] for item in saved] == ["", "Pull", "Pull"]
    assert len(saved[0]["sets"]) == 1
    response = client.delete(url, {"name": "Pull"}, format="json")
    assert response.status_code == 200
    assert len(response.json()["exercises"]) == 3
    assert all(not item["group_name"] for item in response.json()["exercises"])


@pytest.mark.parametrize(
    "bad_data",
    [
        {"member_ids": []},
        {"colour": "red"},
        {"name": " "},
        {"original_name": "Missing"},
        {"member_ids": ["bad-uuid"]},
    ],
)
def test_invalid_group_save_changes_nothing(bad_data: dict) -> None:
    client, workout, items = group_fixture()
    url = BASE + f"sessions/{workout['id']}/groups/"
    data = {"name": "Superset 1", "colour": "#007f68", "member_ids": [items[0]["id"]]}
    data.update(bad_data)
    assert client.put(url, data, format="json").status_code == 400
    assert all(
        not item["group_name"]
        for item in client.get(BASE + f"sessions/{workout['id']}/").json()["exercises"]
    )


def test_group_ownership_session_boundaries_and_finished_workout() -> None:
    client, workout, items = group_fixture()
    other, other_workout, foreign = group_fixture("other@example.com")
    url = BASE + f"sessions/{workout['id']}/groups/"
    data = {"name": "A", "colour": "#007f68", "member_ids": [items[0]["id"]]}
    assert other.put(url, data, format="json").status_code == 404
    assert other.delete(url, {"name": "A"}, format="json").status_code == 404
    data["member_ids"].append(foreign[0]["id"])
    assert client.put(url, data, format="json").status_code == 400
    data["member_ids"] = [items[0]["id"]]
    data["add_exercise_ids"] = [foreign[0]["exercise_id"]]
    assert client.put(url, data, format="json").status_code == 400
    data.pop("add_exercise_ids")
    client.patch(
        BASE + f"sessions/{workout['id']}/", {"is_finished": True}, format="json"
    )
    assert client.put(url, data, format="json").status_code == 400
    assert client.delete(url, {"name": "A"}, format="json").status_code == 400


def test_library_addition_copy_and_routine_keep_independent_group_colours() -> None:
    client, workout, items = group_fixture()
    url = BASE + f"sessions/{workout['id']}/groups/"
    library = client.get(BASE + "catalog/").json()["exercises"]
    extra = next(e for e in library if e["id"] not in {i["exercise_id"] for i in items})
    response = client.put(
        url,
        {
            "name": "Circuit",
            "colour": "#d97706",
            "member_ids": [items[0]["id"]],
            "add_exercise_ids": [extra["id"]],
        },
        format="json",
    )
    assert response.status_code == 200
    assert len(response.json()["exercises"]) == 4
    copy = client.post(
        BASE + f"sessions/{workout['id']}/copy/",
        {"performed_on": "2026-10-03"},
        format="json",
    ).json()
    routine = client.post(BASE + "routines/", {"name": "Plan"}, format="json").json()
    day = client.post(
        BASE + f"routines/{routine['id']}/days/",
        {"name": "A", "source_workout_id": workout["id"]},
        format="json",
    ).json()
    started = client.post(
        BASE + f"routine-days/{day['id']}/start/",
        {"performed_on": "2026-10-04"},
        format="json",
    ).json()
    for saved in [copy, day, started]:
        grouped = [item for item in saved["exercises"] if item["group_name"]]
        assert len(grouped) == 2
        assert all(item["group_colour"] == "#d97706" for item in grouped)
    client.delete(url, {"name": "Circuit"}, format="json")
    assert (
        client.get(BASE + f"sessions/{copy['id']}/").json()["exercises"][0][
            "group_name"
        ]
        == "Circuit"
    )
