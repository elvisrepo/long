"""Recovery scenarios: auth, evidence, daily idempotency, ownership,
Pro creation, validation, archive/history, account export and deletion.
"""

import json

import pytest
from rest_framework.test import APIClient

from apps.subscriptions.models import Subscription, SubscriptionPlan
from apps.users.models import User

pytestmark = pytest.mark.django_db


def test_recovery_requires_authentication() -> None:
    assert APIClient().get("/api/v1/recovery/tools/").status_code == 401


def recovery_client(
    email: str = "recovery@example.com", *, pro: bool = False
) -> tuple[APIClient, User]:
    user = User.objects.create_user(email=email, password="account-password-123")
    plan = SubscriptionPlan.objects.get(code="free")
    if pro:
        plan, _ = SubscriptionPlan.objects.get_or_create(
            code="pro",
            defaults={
                "name": "Pro",
                "active_custom_metric_limit": 10,
                "wearable_connection_limit": 2,
                "sync_interval_minutes": 15,
            },
        )
    Subscription.objects.create(user=user, plan=plan, status="active")
    client = APIClient()
    client.force_authenticate(user)
    return client, user


def test_free_catalog_has_six_shared_tools_and_exact_soreness_evidence() -> None:
    client, _ = recovery_client()
    response = client.get("/api/v1/recovery/tools/")
    assert response.status_code == 200
    data = response.json()
    assert data["can_create_custom"] is False
    assert [tool["name"] for tool in data["tools"]] == [
        "Massage",
        "Active recovery",
        "Compression garments",
        "Cryotherapy / cryostimulation",
        "Water immersion",
        "Contrast water therapy",
    ]
    assert [tool["evidence"]["smd"] for tool in data["tools"]] == [
        -2.26,
        -0.94,
        -0.92,
        -0.53,
        -0.47,
        -0.40,
    ]
    assert data["tools"][0]["evidence"]["ci_lower"] == -3.05
    assert data["tools"][0]["evidence"]["ci_upper"] == -1.47
    assert data["tools"][0]["evidence"]["outcome"] == "doms"


def test_daily_checkoff_is_idempotent_and_can_be_undone() -> None:
    client, _ = recovery_client()
    tool_id = client.get("/api/v1/recovery/tools/").json()["tools"][0]["id"]
    url = f"/api/v1/recovery/entries/{tool_id}/2026-09-30/"
    assert client.put(url, {}, format="json").status_code == 200
    assert client.put(url, {}, format="json").status_code == 200
    entries = client.get(
        "/api/v1/recovery/entries/?date_from=2026-09-24&date_to=2026-09-30"
    ).json()
    assert len(entries) == 1
    assert entries[0]["performed_on"] == "2026-09-30"
    assert entries[0]["tool_id"] == tool_id
    assert client.delete(url).status_code == 204
    assert client.delete(url).status_code == 204
    assert (
        client.get(
            "/api/v1/recovery/entries/?date_from=2026-09-24&date_to=2026-09-30"
        ).json()
        == []
    )


def test_only_pro_can_create_private_unrated_tools() -> None:
    free, _ = recovery_client()
    assert (
        free.post(
            "/api/v1/recovery/tools/", {"name": "Sauna"}, format="json"
        ).status_code
        == 403
    )
    pro, _ = recovery_client("pro@example.com", pro=True)
    response = pro.post(
        "/api/v1/recovery/tools/",
        {"name": "Sauna", "evidence": {"smd": -10}, "user": "spoofed"},
        format="json",
    )
    assert response.status_code == 201
    assert response.json()["is_custom"] is True
    assert response.json()["evidence"] is None
    assert len(pro.get("/api/v1/recovery/tools/").json()["tools"]) == 7
    assert len(free.get("/api/v1/recovery/tools/").json()["tools"]) == 6


def test_archive_preserves_history_and_other_users_cannot_modify_tools() -> None:
    client, _ = recovery_client(pro=True)
    other, _ = recovery_client("other@example.com", pro=True)
    tool_id = client.post(
        "/api/v1/recovery/tools/", {"name": "Sauna"}, format="json"
    ).json()["id"]
    url = f"/api/v1/recovery/tools/{tool_id}/"
    entry_url = f"/api/v1/recovery/entries/{tool_id}/2026-09-30/"
    assert client.put(entry_url, {}, format="json").status_code == 200
    assert other.put(entry_url, {}, format="json").status_code == 404
    assert other.delete(entry_url).status_code == 404
    assert other.patch(url, {"is_active": False}, format="json").status_code == 404
    assert (
        other.get(
            "/api/v1/recovery/entries/?date_from=2026-09-30&date_to=2026-09-30"
        ).json()
        == []
    )
    assert client.patch(url, {"is_active": False}, format="json").status_code == 200
    assert client.put(entry_url, {}, format="json").status_code == 400
    assert (
        len(
            client.get(
                "/api/v1/recovery/entries/?date_from=2026-09-30&date_to=2026-09-30"
            ).json()
        )
        == 1
    )
    shared_id = client.get("/api/v1/recovery/tools/").json()["tools"][0]["id"]
    assert (
        client.patch(
            f"/api/v1/recovery/tools/{shared_id}/", {"is_active": False}, format="json"
        ).status_code
        == 404
    )


def test_export_contains_owned_recovery_data_and_delete_cascades_it() -> None:
    from apps.recovery.models import RecoveryEntry, RecoveryTool

    client, user = recovery_client(pro=True)
    other, _ = recovery_client("other@example.com", pro=True)
    own_id = client.post(
        "/api/v1/recovery/tools/", {"name": "My sauna"}, format="json"
    ).json()["id"]
    other_id = other.post(
        "/api/v1/recovery/tools/", {"name": "Other sauna"}, format="json"
    ).json()["id"]
    shared = RecoveryTool.objects.get(slug="massage", user=None)
    RecoveryEntry.objects.create(user=user, tool=shared, performed_on="2026-09-30")
    client.put(f"/api/v1/recovery/entries/{own_id}/2026-09-30/", {}, format="json")
    response = client.get("/api/v1/me/export/")
    data = json.loads(b"".join(response.streaming_content))
    assert {tool["id"] for tool in data["recovery_tools"]} == {own_id, str(shared.id)}
    assert len(data["recovery_entries"]) == 2
    assert (
        client.delete(
            "/api/v1/me/", {"password": "account-password-123"}, format="json"
        ).status_code
        == 204
    )
    assert not RecoveryEntry.objects.filter(user_id=user.pk).exists()
    assert not RecoveryTool.objects.filter(pk=own_id).exists()
    assert RecoveryTool.objects.filter(pk=other_id).exists()
    assert RecoveryTool.objects.filter(pk=shared.pk).exists()


@pytest.mark.parametrize(
    "query",
    [
        "",
        "?date_from=oops&date_to=2026-09-30",
        "?date_from=2026-09-30&date_to=2026-09-20",
        "?date_from=2024-01-01&date_to=2026-09-30",
    ],
)
def test_invalid_or_unbounded_entry_ranges_are_rejected(query: str) -> None:
    client, _ = recovery_client()
    assert client.get(f"/api/v1/recovery/entries/{query}").status_code == 400


def test_custom_validation_and_downgrade_preserve_existing_tools() -> None:
    client, user = recovery_client(pro=True)
    for name in ["", "   ", "x" * 121]:
        assert (
            client.post(
                "/api/v1/recovery/tools/", {"name": name}, format="json"
            ).status_code
            == 400
        )
    tool_id = client.post(
        "/api/v1/recovery/tools/", {"name": "Sauna"}, format="json"
    ).json()["id"]
    Subscription.objects.filter(user=user).update(
        plan=SubscriptionPlan.objects.get(code="free")
    )
    assert (
        client.post(
            "/api/v1/recovery/tools/", {"name": "Yoga"}, format="json"
        ).status_code
        == 403
    )
    assert (
        client.put(
            f"/api/v1/recovery/entries/{tool_id}/not-a-date/", {}, format="json"
        ).status_code
        == 400
    )
    assert (
        client.put(
            f"/api/v1/recovery/entries/{tool_id}/2026-09-30/", {}, format="json"
        ).status_code
        == 200
    )
    assert (
        client.patch(
            f"/api/v1/recovery/tools/{tool_id}/", {"name": "My sauna"}, format="json"
        ).status_code
        == 200
    )


@pytest.mark.parametrize(
    "method,path",
    [
        ("get", "entries/?date_from=2026-09-30&date_to=2026-09-30"),
        ("post", "tools/"),
        ("patch", "tools/00000000-0000-0000-0000-000000000000/"),
        ("put", "entries/00000000-0000-0000-0000-000000000000/2026-09-30/"),
        ("delete", "entries/00000000-0000-0000-0000-000000000000/2026-09-30/"),
    ],
)
def test_all_recovery_operations_require_auth(method: str, path: str) -> None:
    assert getattr(APIClient(), method)(f"/api/v1/recovery/{path}").status_code == 401
