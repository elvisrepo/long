"""Stretching checklist API and personal-data lifecycle tests."""

import json
from concurrent.futures import ThreadPoolExecutor
from io import BytesIO
from pathlib import Path
from threading import Barrier, Lock

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from django.db import close_old_connections
from django.test import override_settings
from PIL import Image
from rest_framework.test import APIClient

from apps.subscriptions.models import Subscription, SubscriptionPlan
from apps.users.models import User

pytestmark = pytest.mark.django_db


def stretching_client(email: str = "stretching@example.com") -> tuple[APIClient, User]:
    user = User.objects.create_user(email=email, password="account-password-123")
    Subscription.objects.create(
        user=user, plan=SubscriptionPlan.objects.get(code="free"), status="active"
    )
    client = APIClient()
    client.force_authenticate(user)
    return client, user


def test_catalog_requires_authentication() -> None:
    assert APIClient().get("/api/v1/stretching/exercises/").status_code == 401
    assert APIClient().get("/api/v1/stretching/preferences/").status_code == 401


def test_catalog_preferences_reject_unknown_hidden_exercises() -> None:
    client, _ = stretching_client()
    response = client.patch(
        "/api/v1/stretching/preferences/",
        {"hidden_exercise_ids": ["00000000-0000-0000-0000-000000000001"]},
        format="json",
    )
    assert response.status_code == 400


def test_user_can_create_a_private_custom_stretch() -> None:
    client, _ = stretching_client()
    other, _ = stretching_client("other-stretching@example.com")
    response = client.post(
        "/api/v1/stretching/exercises/",
        {
            "phase": "lower-body",
            "name": "My hip opener",
            "description": "A personal movement cue.",
            "dosage": "30 seconds per side",
        },
        format="json",
    )

    assert response.status_code == 201
    exercise = response.json()
    assert exercise["is_custom"] is True
    assert exercise["name"] == "My hip opener"
    assert exercise["description"] == "A personal movement cue."
    assert exercise["image_url"] is None
    assert exercise["is_visible"] is True
    own_catalog = client.get("/api/v1/stretching/exercises/").json()
    other_catalog = other.get("/api/v1/stretching/exercises/").json()
    assert any(
        item["id"] == exercise["id"]
        for phase in own_catalog["phases"]
        for item in phase["exercises"]
    )
    assert not any(
        item["id"] == exercise["id"]
        for phase in other_catalog["phases"]
        for item in phase["exercises"]
    )


def test_multipart_custom_stretch_is_active_when_active_flag_is_omitted() -> None:
    client, _ = stretching_client()
    response = client.post(
        "/api/v1/stretching/exercises/",
        {
            "phase": "lower-body",
            "name": "Multipart hip opener",
            "description": "A personal movement cue.",
            "dosage": "30 seconds per side",
        },
        format="multipart",
    )

    assert response.status_code == 201
    assert response.json()["is_active"] is True


def test_custom_stretch_mutations_are_owner_scoped_and_archive_preserves_history() -> (
    None
):
    client, _ = stretching_client()
    other, _ = stretching_client("other-stretching@example.com")
    created = client.post(
        "/api/v1/stretching/exercises/",
        {"phase": "upper-body", "name": "Desk release"},
        format="json",
    )
    exercise_id = created.json()["id"]
    detail_url = f"/api/v1/stretching/exercises/{exercise_id}/"

    assert other.patch(detail_url, {"name": "Stolen"}, format="json").status_code == 404
    assert other.delete(detail_url).status_code == 404
    assert (
        client.put(
            f"/api/v1/stretching/entries/{exercise_id}/2026-10-13/", {}, format="json"
        ).status_code
        == 200
    )
    assert client.delete(detail_url).status_code == 204
    assert (
        client.get(
            "/api/v1/stretching/entries/?date_from=2026-10-13&date_to=2026-10-13"
        ).json()[0]["exercise_id"]
        == exercise_id
    )
    assert (
        client.put(
            f"/api/v1/stretching/entries/{exercise_id}/2026-10-14/", {}, format="json"
        ).status_code
        == 404
    )


def test_custom_stretch_image_is_normalized_and_stored_outside_the_database(
    tmp_path: Path,
) -> None:
    client, _ = stretching_client()
    other, _ = stretching_client("other-image-reader@example.com")
    image_data = BytesIO()
    Image.new("RGB", (96, 64), "teal").save(image_data, format="PNG")
    image_data.seek(0)
    uploaded = SimpleUploadedFile("stretch.png", image_data.read(), "image/png")

    with override_settings(DEBUG=True, MEDIA_ROOT=tmp_path):
        response = client.post(
            "/api/v1/stretching/exercises/",
            {
                "phase": "lower-body",
                "name": "Photo stretch",
                "image": uploaded,
            },
            format="multipart",
        )
        assert response.status_code == 201
        exercise = response.json()
        assert exercise["image_url"] == (
            f"/api/v1/stretching/exercises/{exercise['id']}/image/"
        )
        image_response = client.get(exercise["image_url"])
        assert image_response.status_code == 200
        assert image_response["Content-Type"] == "image/webp"
        assert image_response["Cache-Control"] == "private, no-store"
        assert other.get(exercise["image_url"]).status_code == 404
        from apps.stretching.models import StretchExercise

        saved = StretchExercise.objects.get(pk=exercise["id"])
        assert saved.image_key.endswith(".webp")
        assert not saved.image_key.startswith("data:")


def test_image_upload_requires_durable_storage_outside_debug(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    client, _ = stretching_client()
    image_data = BytesIO()
    Image.new("RGB", (16, 16), "teal").save(image_data, format="PNG")
    monkeypatch.delenv("STRETCH_IMAGE_BUCKET", raising=False)
    response = client.post(
        "/api/v1/stretching/exercises/",
        {
            "phase": "lower-body",
            "name": "Photo stretch",
            "image": SimpleUploadedFile(
                "stretch.png", image_data.getvalue(), "image/png"
            ),
        },
        format="multipart",
    )
    assert response.status_code == 503


def test_failed_image_replacement_does_not_save_other_stretch_edits(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    client, _ = stretching_client()
    created = client.post(
        "/api/v1/stretching/exercises/",
        {"phase": "lower-body", "name": "Original name"},
        format="json",
    )
    exercise_id = created.json()["id"]

    def reject_image(*_args: object) -> str:
        raise ValueError("Image is invalid.")

    monkeypatch.setattr(
        "apps.stretching.views.save_stretch_image",
        reject_image,
    )
    image_data = BytesIO()
    Image.new("RGB", (16, 16), "teal").save(image_data, format="PNG")

    response = client.patch(
        f"/api/v1/stretching/exercises/{exercise_id}/",
        {
            "name": "Unexpected saved name",
            "image": SimpleUploadedFile(
                "stretch.png", image_data.getvalue(), "image/png"
            ),
        },
        format="multipart",
    )

    assert response.status_code == 400
    response = client.get("/api/v1/stretching/exercises/")
    saved = next(
        exercise
        for phase in response.json()["phases"]
        for exercise in phase["exercises"]
        if exercise["id"] == exercise_id
    )
    assert saved["name"] == "Original name"


@pytest.mark.django_db(transaction=True)
def test_concurrent_image_replacements_clean_up_the_intermediate_object(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    client, user = stretching_client()
    created = client.post(
        "/api/v1/stretching/exercises/",
        {"phase": "lower-body", "name": "Concurrent replacement"},
        format="json",
    )
    exercise_id = created.json()["id"]
    from apps.stretching.models import StretchExercise

    exercise = StretchExercise.objects.get(pk=exercise_id)
    exercise.image_key = "stretching/old.webp"
    exercise.save(update_fields=["image_key"])
    upload_barrier = Barrier(2)
    recorded_deletions: list[str] = []
    deletion_lock = Lock()

    def save_image(upload: SimpleUploadedFile, *_args: object) -> str:
        upload_barrier.wait(timeout=5)
        return f"stretching/{upload.name}.webp"

    def record_deletion(key: str) -> None:
        with deletion_lock:
            recorded_deletions.append(key)

    monkeypatch.setattr("apps.stretching.views.save_stretch_image", save_image)
    monkeypatch.setattr("apps.stretching.views.delete_stretch_image", record_deletion)
    image_data = BytesIO()
    Image.new("RGB", (16, 16), "teal").save(image_data, format="PNG")
    image_bytes = image_data.getvalue()

    def replace_image(filename: str) -> int:
        close_old_connections()
        try:
            request_client = APIClient()
            request_client.force_authenticate(user)
            return request_client.patch(
                f"/api/v1/stretching/exercises/{exercise_id}/",
                {
                    "image": SimpleUploadedFile(
                        filename, image_bytes, "image/png"
                    )
                },
                format="multipart",
            ).status_code
        finally:
            close_old_connections()

    with ThreadPoolExecutor(max_workers=2) as executor:
        statuses = list(executor.map(replace_image, ["first.png", "second.png"]))

    exercise.refresh_from_db()
    replacement_keys = {"stretching/first.png.webp", "stretching/second.png.webp"}
    assert statuses == [200, 200]
    assert exercise.image_key in replacement_keys
    assert set(recorded_deletions) == {"stretching/old.webp"} | (
        replacement_keys - {exercise.image_key}
    )


def test_catalog_has_two_ordered_starter_phases() -> None:
    client, _ = stretching_client()
    response = client.get("/api/v1/stretching/exercises/")
    assert response.status_code == 200
    phases = response.json()["phases"]
    assert [phase["slug"] for phase in phases] == ["lower-body", "upper-body"]
    assert len(phases[0]["exercises"]) == 10
    assert len(phases[1]["exercises"]) == 10
    assert phases[0]["exercises"][0]["name"] == "Lunge Stretch"
    assert phases[0]["exercises"][0]["dosage"] == "30 seconds per leg"
    assert (
        "move the hip, not the lower back"
        in phases[0]["exercises"][0]["description"].lower()
    )
    assert (
        "lower the left leg and right arm"
        in phases[0]["exercises"][7]["description"].lower()
    )
    assert "knees slightly bent" in phases[0]["exercises"][8]["description"].lower()
    assert phases[0]["exercises"][2]["dosage"] == "15 slow movements up and down"
    assert (
        "move gently between arching your back and rounding it"
        in phases[0]["exercises"][6]["description"].lower()
    )
    assert [exercise["name"] for exercise in phases[1]["exercises"]] == [
        "Foam Rolling Thoracic Spine",
        "Extending Thoracic Spine",
        "Extending Thoracic Spine (Bench)",
        "Wall Pec Stretch",
        "Lats Stretch",
        "Shoulder Stretch",
        "Shoulder Dislocations",
        "Scapular Wall Slide",
        "Chin tuck",
        "Reverse Crunch",
    ]
    assert phases[1]["exercises"][0]["dosage"] == "10× centered, 10× left, 10× right"
    assert "foam-roll" in phases[1]["exercises"][0]["description"].lower()
    assert "door ledge" in phases[1]["exercises"][3]["description"].lower()
    assert (
        "keep the back of the head against the wall"
        in phases[1]["exercises"][8]["description"].lower()
    )
    assert all(
        exercise["is_visible"] for phase in phases for exercise in phase["exercises"]
    )


def test_shared_catalog_visibility_is_private_and_keeps_checkoff_history() -> None:
    client, _ = stretching_client()
    other, _ = stretching_client("other-stretching@example.com")
    catalog = client.get("/api/v1/stretching/exercises/").json()
    exercise = catalog["phases"][0]["exercises"][0]
    checkoff_url = f"/api/v1/stretching/entries/{exercise['id']}/2026-10-09/"
    assert client.put(checkoff_url, {}, format="json").status_code == 200

    preferences_url = "/api/v1/stretching/preferences/"
    assert (
        client.patch(
            preferences_url, {"show_shared_exercises": False}, format="json"
        ).status_code
        == 200
    )

    own_catalog = client.get("/api/v1/stretching/exercises/").json()
    other_catalog = other.get("/api/v1/stretching/exercises/").json()
    assert not any(
        item["is_visible"]
        for phase in own_catalog["phases"]
        for item in phase["exercises"]
    )
    assert all(
        item["is_visible"]
        for phase in other_catalog["phases"]
        for item in phase["exercises"]
    )
    assert (
        client.get(
            "/api/v1/stretching/entries/?date_from=2026-10-09&date_to=2026-10-09"
        ).json()[0]["exercise_id"]
        == exercise["id"]
    )


def test_user_can_hide_and_restore_individual_shared_exercises() -> None:
    client, _ = stretching_client()
    exercise = client.get("/api/v1/stretching/exercises/").json()["phases"][0][
        "exercises"
    ][0]
    preferences_url = "/api/v1/stretching/preferences/"

    hidden = client.patch(
        preferences_url,
        {"hidden_exercise_ids": [exercise["id"]]},
        format="json",
    )
    assert hidden.status_code == 200
    catalog = client.get("/api/v1/stretching/exercises/").json()
    assert not catalog["phases"][0]["exercises"][0]["is_visible"]

    restored = client.patch(preferences_url, {"hidden_exercise_ids": []}, format="json")
    assert restored.status_code == 200
    catalog = client.get("/api/v1/stretching/exercises/").json()
    assert catalog["phases"][0]["exercises"][0]["is_visible"]


def test_daily_checkoff_is_idempotent_and_user_scoped() -> None:
    client, _ = stretching_client()
    other, _ = stretching_client("other-stretching@example.com")
    exercise = client.get("/api/v1/stretching/exercises/").json()["phases"][0][
        "exercises"
    ][0]
    url = f"/api/v1/stretching/entries/{exercise['id']}/2026-10-09/"
    assert client.put(url, {}, format="json").status_code == 200
    assert client.put(url, {}, format="json").status_code == 200
    assert (
        other.get(
            "/api/v1/stretching/entries/?date_from=2026-10-09&date_to=2026-10-09"
        ).json()
        == []
    )
    assert (
        len(
            client.get(
                "/api/v1/stretching/entries/?date_from=2026-10-09&date_to=2026-10-09"
            ).json()
        )
        == 1
    )
    assert client.delete(url).status_code == 204
    assert client.delete(url).status_code == 204


def test_export_includes_checkoffs_and_account_delete_cascades() -> None:
    from apps.stretching.models import StretchEntry, StretchExercise

    client, user = stretching_client()
    custom = client.post(
        "/api/v1/stretching/exercises/",
        {
            "phase": "upper-body",
            "name": "Private stretch",
            "description": "A private cue.",
        },
        format="json",
    )
    assert custom.status_code == 201
    exercise = StretchExercise.objects.get(slug="lower-body-lunge-stretch")
    client.put(
        f"/api/v1/stretching/entries/{exercise.pk}/2026-10-09/", {}, format="json"
    )
    client.patch(
        "/api/v1/stretching/preferences/",
        {"show_shared_exercises": False},
        format="json",
    )
    response = client.get("/api/v1/me/export/")
    data = json.loads(b"".join(response.streaming_content))
    assert data["stretching_entries"][0]["exercise_id"] == str(exercise.pk)
    assert data["stretching_entries"][0]["exercise__slug"] == exercise.slug
    assert data["stretching_entries"][0]["exercise__name"] == exercise.name
    assert data["stretching_entries"][0]["exercise__phase"] == exercise.phase
    assert data["stretching_preferences"][0]["show_shared_exercises"] is False
    assert data["custom_stretch_exercises"][0]["name"] == "Private stretch"
    assert (
        client.delete(
            "/api/v1/me/", {"password": "account-password-123"}, format="json"
        ).status_code
        == 204
    )
    assert not StretchEntry.objects.filter(user=user).exists()
    assert not StretchExercise.objects.filter(user=user).exists()
