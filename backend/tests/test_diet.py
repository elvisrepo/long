"""Scenarios: empty catalog, ownership, duplicates, order/archive, daily
idempotency, bounded history, validation, account export/deletion, all plans.
"""

import pytest
from django.core.exceptions import ValidationError
from rest_framework.test import APIClient

from apps.users.models import User

pytestmark = pytest.mark.django_db


def diet_client(email: str = "diet@example.com") -> tuple[APIClient, User]:
    user = User.objects.create_user(email=email, password="password-123")
    client = APIClient()
    client.force_authenticate(user)
    return client, user


def test_diet_catalog_starts_empty_and_free_users_can_build_it() -> None:
    client, user = diet_client()
    assert client.get("/api/v1/diet/catalog/").json() == {"sections": [], "foods": []}
    section = client.post(
        "/api/v1/diet/sections/", {"name": "Protein", "user": "spoofed"}, format="json"
    )
    assert section.status_code == 201
    food = client.post(
        "/api/v1/diet/foods/",
        {"name": "Chicken", "section_id": section.json()["id"]},
        format="json",
    )
    assert food.status_code == 201
    from apps.diet.models import DietSection

    assert DietSection.objects.get(pk=section.json()["id"]).user == user
    assert len(client.get("/api/v1/diet/catalog/").json()["foods"]) == 1


def test_diet_model_rejects_mismatched_entry_owner() -> None:
    from apps.diet.models import DietEntry, DietFood, DietSection

    owner = User.objects.create_user(email="diet@example.com", password="password-123")
    other = User.objects.create_user(email="other@example.com", password="password-123")
    section = DietSection.objects.create(user=owner, name="Protein")
    food = DietFood.objects.create(section=section, name="Chicken")
    with pytest.raises(ValidationError):
        DietEntry(user=other, food=food, performed_on="2026-10-01").full_clean()


def make_food(client: APIClient, name: str = "Chicken") -> tuple[str, str]:
    section_id = client.post(
        "/api/v1/diet/sections/", {"name": "Protein"}, format="json"
    ).json()["id"]
    food_id = client.post(
        "/api/v1/diet/foods/", {"section_id": section_id, "name": name}, format="json"
    ).json()["id"]
    return section_id, food_id


def test_owner_only_daily_checkoffs_are_idempotent_and_history_is_private() -> None:
    client, _ = diet_client()
    other, other_user = diet_client("other@example.com")
    section_id, food_id = make_food(client)
    url = f"/api/v1/diet/entries/{food_id}/2026-10-01/"
    assert (
        client.put(url, {"user_id": str(other_user.pk)}, format="json").status_code
        == 200
    )
    assert client.put(url, {}, format="json").status_code == 200
    history = "/api/v1/diet/entries/?date_from=2026-09-25&date_to=2026-10-01"
    assert len(client.get(history).json()) == 1
    assert other.get(history).json() == []
    assert other.get("/api/v1/diet/catalog/").json() == {"sections": [], "foods": []}
    assert other.put(url, {}, format="json").status_code == 404
    assert other.delete(url).status_code == 404
    assert (
        other.patch(
            f"/api/v1/diet/sections/{section_id}/", {"name": "Stolen"}, format="json"
        ).status_code
        == 404
    )
    assert (
        other.patch(
            f"/api/v1/diet/foods/{food_id}/", {"name": "Stolen"}, format="json"
        ).status_code
        == 404
    )
    assert (
        other.post(
            "/api/v1/diet/foods/",
            {"name": "Stolen", "section_id": section_id},
            format="json",
        ).status_code
        == 400
    )
    assert client.delete(url).status_code == 204
    assert client.delete(url).status_code == 204
    assert client.get(history).json() == []


@pytest.mark.parametrize("kind", ["food", "section"])
def test_archive_restore_preserves_history_and_blocks_new_entries(kind: str) -> None:
    client, _ = diet_client()
    section_id, food_id = make_food(client)
    url = f"/api/v1/diet/entries/{food_id}/2026-10-01/"
    detail = f"/api/v1/diet/{'foods' if kind == 'food' else 'sections'}/{food_id if kind == 'food' else section_id}/"
    assert client.put(url, {}, format="json").status_code == 200
    assert client.patch(detail, {"is_active": False}, format="json").status_code == 200
    assert client.put(url, {}, format="json").status_code == 400
    assert (
        len(
            client.get(
                "/api/v1/diet/entries/?date_from=2026-10-01&date_to=2026-10-01"
            ).json()
        )
        == 1
    )
    if kind == "section":
        assert (
            client.post(
                "/api/v1/diet/foods/",
                {"section_id": section_id, "name": "Eggs"},
                format="json",
            ).status_code
            == 400
        )
    assert client.patch(detail, {"is_active": True}, format="json").status_code == 200
    assert client.put(url, {}, format="json").status_code == 200


def test_rename_order_and_case_insensitive_names_are_scoped() -> None:
    client, _ = diet_client()
    section_id, food_id = make_food(client)
    assert (
        client.post(
            "/api/v1/diet/sections/", {"name": " protein "}, format="json"
        ).status_code
        == 400
    )
    assert (
        client.post(
            "/api/v1/diet/foods/",
            {"section_id": section_id, "name": " chicken "},
            format="json",
        ).status_code
        == 400
    )
    other_section = client.post(
        "/api/v1/diet/sections/", {"name": "Lunch"}, format="json"
    ).json()["id"]
    assert (
        client.post(
            "/api/v1/diet/foods/",
            {"section_id": other_section, "name": "Chicken"},
            format="json",
        ).status_code
        == 201
    )
    assert (
        client.patch(
            f"/api/v1/diet/foods/{food_id}/",
            {"section_id": other_section},
            format="json",
        ).status_code
        == 400
    )
    assert (
        client.patch(
            f"/api/v1/diet/sections/{other_section}/",
            {"display_order": 0, "name": "Dinner"},
            format="json",
        ).status_code
        == 200
    )
    assert client.get("/api/v1/diet/catalog/").json()["sections"][0]["name"] == "Dinner"
    assert (
        client.patch(
            f"/api/v1/diet/foods/{food_id}/",
            {"name": "Eggs", "display_order": 0},
            format="json",
        ).status_code
        == 200
    )


@pytest.mark.parametrize("name", ["", "   ", "a" * 121])
def test_diet_names_are_validated(name: str) -> None:
    client, _ = diet_client()
    assert (
        client.post("/api/v1/diet/sections/", {"name": name}, format="json").status_code
        == 400
    )


@pytest.mark.parametrize(
    "query",
    [
        "",
        "?date_from=bad&date_to=2026-10-01",
        "?date_from=2026-10-02&date_to=2026-10-01",
        "?date_from=2025-01-01&date_to=2026-10-01",
    ],
)
def test_diet_history_requires_bounded_valid_dates(query: str) -> None:
    client, _ = diet_client()
    assert client.get("/api/v1/diet/entries/" + query).status_code == 400


@pytest.mark.parametrize(
    "method,path",
    [
        ("get", "catalog/"),
        ("post", "sections/"),
        ("post", "foods/"),
        ("get", "entries/"),
        ("patch", "sections/00000000-0000-0000-0000-000000000000/"),
        ("patch", "foods/00000000-0000-0000-0000-000000000000/"),
        ("put", "entries/00000000-0000-0000-0000-000000000000/2026-10-01/"),
        ("delete", "entries/00000000-0000-0000-0000-000000000000/2026-10-01/"),
    ],
)
def test_all_diet_endpoints_require_auth(method: str, path: str) -> None:
    assert getattr(APIClient(), method)("/api/v1/diet/" + path).status_code == 401


def test_diet_is_included_in_account_export_and_deletion() -> None:
    import json
    from apps.diet.models import DietEntry, DietFood, DietSection
    from apps.users.account import account_export, delete_account

    client, user = diet_client()
    other, other_user = diet_client("other@example.com")
    _, food_id = make_food(client)
    _, other_food_id = make_food(other)
    client.put(f"/api/v1/diet/entries/{food_id}/2026-10-01/", {}, format="json")
    other.put(f"/api/v1/diet/entries/{other_food_id}/2026-10-01/", {}, format="json")
    data = json.loads("".join(account_export(user)))
    assert [food["id"] for food in data["diet_foods"]] == [food_id]
    assert len(data["diet_sections"]) == len(data["diet_entries"]) == 1
    delete_account(user=user, password="password-123")
    assert not DietSection.objects.filter(user=user).exists()
    assert not DietFood.objects.filter(pk=food_id).exists()
    assert not DietEntry.objects.filter(user=user).exists()
    assert DietFood.objects.filter(pk=other_food_id).exists()
    assert DietEntry.objects.filter(user=other_user).exists()
