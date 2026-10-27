"""Scenarios: atomic manual order, alphabetical mode, stale/foreign IDs,
colour validation, stable starter colours, export and history preservation.
"""

import pytest
from rest_framework.test import APIClient
from apps.users.models import User
from apps.workouts.models import ExerciseCategory

pytestmark = pytest.mark.django_db
BASE = "/api/v1/workouts/"


def fixture() -> tuple[APIClient, User, list[ExerciseCategory]]:
    user = User.objects.create_user(
        email="categories@example.com", password="password-123"
    )
    client = APIClient()
    client.force_authenticate(user)
    rows = [
        ExerciseCategory.objects.create(user=user, name=name, display_order=n * 10)
        for n, name in enumerate(["Chest", "Back", "Legs"])
    ]
    return client, user, rows


def test_manual_category_order_is_saved_atomically_with_its_mode() -> None:
    client, _, rows = fixture()
    before = [str(row.pk) for row in rows]
    order = [before[2], before[0], before[1]]
    response = client.post(
        BASE + "categories/reorder/",
        {
            "mode": "manual",
            "category_ids": order,
            "expected_order": before,
        },
        format="json",
    )
    assert response.status_code == 200
    assert [row["id"] for row in response.json()["categories"]] == order
    assert response.json()["preferences"]["category_order"] == "manual"
    assert list(
        ExerciseCategory.objects.order_by("display_order").values_list(
            "display_order", flat=True
        )
    ) == [10, 20, 30]


def test_alphabetical_mode_preserves_the_saved_manual_sequence() -> None:
    client, _, rows = fixture()
    ids = [str(row.pk) for row in rows]
    assert client.get(BASE + "preferences/").json()["category_order"] == "alphabetical"
    response = client.post(
        BASE + "categories/reorder/",
        {
            "mode": "alphabetical",
            "category_ids": list(reversed(ids)),
            "expected_order": ids,
        },
        format="json",
    )
    assert response.status_code == 200
    assert [row["id"] for row in response.json()["categories"]] == ids
    assert response.json()["preferences"]["category_order"] == "alphabetical"


@pytest.mark.parametrize(
    "fault,status",
    [("stale", 409), ("missing", 400), ("duplicate", 400), ("foreign", 400)],
)
def test_reorder_rejects_invalid_lists_without_partial_writes(
    fault: str, status: int
) -> None:
    client, user, rows = fixture()
    ids = [str(row.pk) for row in rows]
    before = list(ExerciseCategory.objects.values("id", "display_order"))
    data = {"mode": "manual", "category_ids": ids.copy(), "expected_order": ids.copy()}
    if fault == "stale":
        data["expected_order"] = list(reversed(ids))
    elif fault == "missing":
        data["category_ids"] = ids[:-1]
    elif fault == "duplicate":
        data["category_ids"] = [ids[0]] * 3
    else:
        other = User.objects.create_user(
            email="other@example.com", password="password-123"
        )
        foreign = ExerciseCategory.objects.create(user=other, name="Private")
        data["category_ids"] = [*ids[:-1], str(foreign.pk)]
    assert (
        client.post(BASE + "categories/reorder/", data, format="json").status_code
        == status
    )
    assert (
        list(ExerciseCategory.objects.filter(user=user).values("id", "display_order"))
        == before
    )
    assert client.get(BASE + "preferences/").json()["category_order"] == "alphabetical"


def test_colours_validate_persist_and_export() -> None:
    import json
    from apps.users.account import account_export

    client, user, rows = fixture()
    url = BASE + f"categories/{rows[0].pk}/"
    assert client.patch(url, {"colour": "red"}, format="json").status_code == 400
    assert (
        client.patch(url, {"colour": "#abcdef"}, format="json").json()["colour"]
        == "#abcdef"
    )
    exported = json.loads("".join(account_export(user)))
    assert (
        next(
            row
            for row in exported["exercise_categories"]
            if row["id"] == str(rows[0].pk)
        )["colour"]
        == "#abcdef"
    )
    anonymous = APIClient()
    assert (
        anonymous.post(BASE + "categories/reorder/", {}, format="json").status_code
        == 401
    )


def test_starter_categories_have_distinct_colours_and_reinitialization_preserves_edits() -> (
    None
):
    client, _, rows = fixture()
    response = client.post(BASE + "catalog/initialize/", {}, format="json")
    colours = [
        row["colour"]
        for row in response.json()["categories"]
        if row["name"] not in {"Chest", "Back", "Legs"}
    ]
    assert len(colours) == len(set(colours))
    client.patch(
        BASE + f"categories/{rows[0].pk}/", {"colour": "#123456"}, format="json"
    )
    response = client.post(BASE + "catalog/initialize/", {}, format="json")
    assert (
        next(
            row for row in response.json()["categories"] if row["id"] == str(rows[0].pk)
        )["colour"]
        == "#123456"
    )
