"""Test list: private/idempotent samples, catalog CRUD/archive, sessions,
owner isolation, snapshots, set validation/completion, copy, ranges, lifecycle.
"""

import pytest
from rest_framework.test import APIClient

from apps.users.models import User

pytestmark = pytest.mark.django_db
BASE = "/api/v1/workouts/"


def workout_client(email: str = "workout@example.com") -> tuple[APIClient, User]:
    user = User.objects.create_user(email=email, password="password-123")
    client = APIClient()
    client.force_authenticate(user)
    return client, user


def test_samples_are_private_repeat_safe_and_do_not_restore_archives() -> None:
    client, _ = workout_client()
    other, _ = workout_client("other@example.com")
    first = client.post(BASE + "catalog/initialize/", {}, format="json")
    assert first.status_code == 200
    assert len(first.json()["categories"]) == 7
    assert len(first.json()["exercises"]) == 10
    exercise = first.json()["exercises"][0]
    assert (
        client.patch(
            BASE + f"exercises/{exercise['id']}/",
            {"name": "My press", "is_active": False},
            format="json",
        ).status_code
        == 200
    )
    again = client.post(BASE + "catalog/initialize/", {}, format="json")
    assert len(again.json()["exercises"]) == 10
    archived = next(e for e in again.json()["exercises"] if e["id"] == exercise["id"])
    assert archived["name"] == "My press" and not archived["is_active"]
    assert other.get(BASE + "catalog/").json() == {"categories": [], "exercises": []}
    theirs = other.post(BASE + "catalog/initialize/", {}, format="json").json()
    assert {e["id"] for e in theirs["exercises"]}.isdisjoint(
        e["id"] for e in first.json()["exercises"]
    )


def test_catalog_management_is_owner_scoped_and_names_are_unique() -> None:
    client, _ = workout_client()
    other, _ = workout_client("other@example.com")
    response = client.post(BASE + "categories/", {"name": "Custom"}, format="json")
    assert response.status_code == 201
    category_id = response.json()["id"]
    assert (
        client.post(
            BASE + "categories/", {"name": " custom "}, format="json"
        ).status_code
        == 400
    )
    response = client.post(
        BASE + "exercises/",
        {"category_id": category_id, "name": "Press", "tracking_type": "strength"},
        format="json",
    )
    assert response.status_code == 201
    exercise_id = response.json()["id"]
    assert response.json()["weight_increment"] == "2.500"
    assert (
        other.patch(
            BASE + f"categories/{category_id}/", {"name": "Stolen"}, format="json"
        ).status_code
        == 404
    )
    assert (
        other.patch(
            BASE + f"exercises/{exercise_id}/", {"name": "Stolen"}, format="json"
        ).status_code
        == 404
    )
    assert (
        other.post(
            BASE + "exercises/",
            {"category_id": category_id, "name": "Press", "tracking_type": "strength"},
            format="json",
        ).status_code
        == 400
    )
    assert (
        client.patch(
            BASE + f"categories/{category_id}/", {"is_active": False}, format="json"
        ).status_code
        == 200
    )
    assert (
        client.post(
            BASE + "exercises/",
            {"category_id": category_id, "name": "New", "tracking_type": "strength"},
            format="json",
        ).status_code
        == 400
    )


def test_sessions_snapshot_library_settings_and_reject_foreign_exercises() -> None:
    client, _ = workout_client()
    other, _ = workout_client("other@example.com")
    catalog = client.post(BASE + "catalog/initialize/", {}, format="json").json()
    exercise = next(
        e for e in catalog["exercises"] if e["name"] == "Barbell bench press"
    )
    session = client.post(
        BASE + "sessions/",
        {"performed_on": "2026-10-01", "name": "Morning"},
        format="json",
    )
    assert session.status_code == 201
    session_id = session.json()["id"]
    assert (
        client.post(
            BASE + "sessions/", {"performed_on": "2026-10-01"}, format="json"
        ).status_code
        == 201
    )
    item = client.post(
        BASE + f"sessions/{session_id}/exercises/",
        {"exercise_id": exercise["id"]},
        format="json",
    )
    assert item.status_code == 201
    assert item.json()["exercise_name"] == "Barbell bench press"
    assert other.get(BASE + f"sessions/{session_id}/").status_code == 404
    theirs = other.post(
        BASE + "sessions/", {"performed_on": "2026-10-01"}, format="json"
    ).json()["id"]
    assert (
        other.post(
            BASE + f"sessions/{theirs}/exercises/",
            {"exercise_id": exercise["id"]},
            format="json",
        ).status_code
        == 400
    )
    assert (
        client.patch(
            BASE + f"exercises/{exercise['id']}/",
            {"name": "New name", "weight_unit": "lb", "tracking_type": "duration"},
            format="json",
        ).status_code
        == 200
    )
    saved = client.get(BASE + f"sessions/{session_id}/").json()["exercises"][0]
    assert saved["exercise_name"] == "Barbell bench press"
    assert saved["weight_unit"] == "kg" and saved["tracking_type"] == "strength"
    assert (
        client.patch(
            BASE + f"categories/{exercise['category_id']}/",
            {"is_active": False},
            format="json",
        ).status_code
        == 200
    )
    assert (
        client.post(
            BASE + f"sessions/{session_id}/exercises/",
            {"exercise_id": exercise["id"]},
            format="json",
        ).status_code
        == 400
    )


def create_item(client: APIClient, tracking_type: str = "strength") -> tuple[str, str]:
    catalog = client.post(BASE + "catalog/initialize/", {}, format="json").json()
    exercise = next(
        e for e in catalog["exercises"] if e["tracking_type"] == tracking_type
    )
    session = client.post(
        BASE + "sessions/", {"performed_on": "2026-10-01"}, format="json"
    ).json()["id"]
    item = client.post(
        BASE + f"sessions/{session}/exercises/",
        {"exercise_id": exercise["id"]},
        format="json",
    ).json()["id"]
    return session, item


def test_sets_distinguish_planning_from_completion_and_allow_safe_partial_edits() -> (
    None
):
    client, _ = workout_client()
    other, _ = workout_client("other@example.com")
    session, item = create_item(client)
    url = BASE + f"session-exercises/{item}/sets/"
    planned = client.post(url, {"is_completed": False}, format="json")
    assert planned.status_code == 201
    set_id = planned.json()["id"]
    assert planned.json()["weight"] is None
    detail = BASE + f"sets/{set_id}/"
    assert (
        client.patch(detail, {"is_completed": True}, format="json").status_code == 400
    )
    assert (
        client.patch(
            detail,
            {"weight": "60", "reps": 8, "is_completed": True, "comment": "Good set"},
            format="json",
        ).status_code
        == 200
    )
    assert (
        client.patch(detail, {"reps": 10}, format="json").json()["weight"] == "60.000"
    )
    assert other.patch(detail, {"reps": 99}, format="json").status_code == 404
    assert other.delete(detail).status_code == 404
    assert other.post(url, {"weight": 60, "reps": 8}, format="json").status_code == 404
    data = client.get(BASE + f"sessions/{session}/").json()
    assert data["completed_set_count"] == 1
    assert data["exercises"][0]["sets"][0]["comment"] == "Good set"
    assert client.patch(detail, {"reps": 0}, format="json").status_code == 400
    assert (
        client.patch(detail, {"duration_seconds": 60}, format="json").status_code == 400
    )
    assert client.delete(detail).status_code == 204
    assert client.get(BASE + f"sessions/{session}/").json()["completed_set_count"] == 0


def test_copy_keeps_snapshots_but_resets_completion_and_history_is_private() -> None:
    client, _ = workout_client()
    other, _ = workout_client("other@example.com")
    session, item = create_item(client)
    assert (
        client.post(
            BASE + f"session-exercises/{item}/sets/",
            {"weight": 60, "reps": 8, "comment": "Actual effort"},
            format="json",
        ).status_code
        == 201
    )
    assert (
        client.patch(
            BASE + f"sessions/{session}/", {"is_finished": True}, format="json"
        ).status_code
        == 200
    )
    copied = client.post(
        BASE + f"sessions/{session}/copy/",
        {"performed_on": "2026-10-02"},
        format="json",
    )
    assert copied.status_code == 201
    assert copied.json()["id"] != session
    assert copied.json()["completed_set_count"] == 0
    assert not copied.json()["is_finished"]
    new_item = copied.json()["exercises"][0]
    assert new_item["id"] != item
    assert new_item["exercise_name"] == "Barbell bench press"
    assert new_item["sets"][0]["weight"] == "60.000"
    assert new_item["sets"][0]["comment"] == ""
    assert not new_item["sets"][0]["is_completed"]
    assert client.get(BASE + f"sessions/{session}/").json()["completed_set_count"] == 1
    url = BASE + "sessions/?date_from=2026-10-01&date_to=2026-10-02"
    assert client.get(url).json()["count"] == 2
    assert other.get(url).json()["results"] == []
    assert (
        other.post(
            BASE + f"sessions/{session}/copy/",
            {"performed_on": "2026-10-02"},
            format="json",
        ).status_code
        == 404
    )
    assert client.get(BASE + "sessions/").status_code == 400
    assert (
        client.get(
            BASE + "sessions/?date_from=2024-01-01&date_to=2026-10-01"
        ).status_code
        == 400
    )


def test_account_export_and_deletion_include_private_workouts_and_archives() -> None:
    import json
    from apps.users.account import account_export, delete_account
    from apps.workouts.models import Exercise, Workout, WorkoutCatalogState, WorkoutSet

    client, user = workout_client()
    other, _ = workout_client("other@example.com")
    session, item = create_item(client)
    other_session, _ = create_item(other)
    client.post(
        BASE + f"session-exercises/{item}/sets/",
        {"weight": 60, "reps": 8},
        format="json",
    )
    exercise = client.get(BASE + f"sessions/{session}/").json()["exercises"][0][
        "exercise_id"
    ]
    client.patch(BASE + f"exercises/{exercise}/", {"is_active": False}, format="json")
    data = json.loads("".join(account_export(user)))
    assert [w["id"] for w in data["workouts"]] == [session]
    assert len(data["workout_sets"]) == len(data["workout_exercises"]) == 1
    assert len(data["exercises"]) == 10
    assert not next(e for e in data["exercises"] if e["id"] == exercise)["is_active"]
    delete_account(user=user, password="password-123")
    assert not Workout.objects.filter(pk=session).exists()
    assert not WorkoutSet.objects.filter(workout_exercise__workout_id=session).exists()
    assert not Exercise.objects.filter(category__user_id=user.pk).exists()
    assert not WorkoutCatalogState.objects.filter(user_id=user.pk).exists()
    assert Workout.objects.filter(pk=other_session).exists()


@pytest.mark.parametrize(
    "tracking_type,values",
    [
        ("strength", {"weight": "0", "reps": 1}),
        ("bodyweight", {"reps": 6}),
        ("duration", {"duration_seconds": 45}),
        ("cardio", {"distance": "4.2", "duration_seconds": 1680}),
    ],
)
def test_completed_sets_use_their_exercise_fields(
    tracking_type: str, values: dict[str, object]
) -> None:
    client, _ = workout_client()
    _, item = create_item(client, tracking_type)
    url = BASE + f"session-exercises/{item}/sets/"
    assert client.post(url, {}, format="json").status_code == 400
    response = client.post(url, values, format="json")
    assert response.status_code == 201
    assert response.json()["is_completed"]


@pytest.mark.parametrize(
    "payload",
    [
        {"weight": -1, "reps": 8},
        {"weight": 60, "reps": 0},
        {"weight": 60, "reps": 1.5},
        {"weight": "NaN", "reps": 8},
        {"weight": 60, "reps": 8, "distance": 5},
        {"weight": 60, "reps": 8, "display_order": -1},
        {"is_completed": False, "duration_seconds": 0},
        {"weight": 60, "reps": 8, "comment": "x" * 2001},
    ],
)
def test_invalid_set_values_are_rejected(payload: dict[str, object]) -> None:
    client, _ = workout_client()
    _, item = create_item(client)
    assert (
        client.post(
            BASE + f"session-exercises/{item}/sets/", payload, format="json"
        ).status_code
        == 400
    )


def test_finished_sessions_need_reopening_and_ordering_never_changes_snapshots() -> (
    None
):
    client, _ = workout_client()
    other, _ = workout_client("other@example.com")
    session, item = create_item(client)
    detail = BASE + f"session-exercises/{item}/"
    assert other.patch(detail, {"display_order": 0}, format="json").status_code == 404
    assert other.delete(detail).status_code == 404
    changed = client.patch(
        detail, {"display_order": 0, "exercise_name": "Spoofed"}, format="json"
    )
    assert changed.status_code == 200
    assert changed.json()["exercise_name"] == "Barbell bench press"
    assert changed.json()["display_order"] == 0
    url = BASE + f"session-exercises/{item}/sets/"
    set_id = client.post(url, {"weight": 60, "reps": 8}, format="json").json()["id"]
    session_detail = BASE + f"sessions/{session}/"
    assert (
        client.patch(session_detail, {"is_finished": True}, format="json").status_code
        == 200
    )
    assert client.post(url, {"weight": 60, "reps": 8}, format="json").status_code == 400
    assert (
        client.patch(BASE + f"sets/{set_id}/", {"reps": 9}, format="json").status_code
        == 400
    )
    assert client.delete(BASE + f"sets/{set_id}/").status_code == 400
    assert client.delete(detail).status_code == 400
    assert (
        client.patch(session_detail, {"is_finished": False}, format="json").status_code
        == 200
    )
    assert client.delete(detail).status_code == 204
    assert client.get(session_detail).json()["exercises"] == []
    assert other.delete(session_detail).status_code == 404
    assert client.delete(session_detail).status_code == 204


@pytest.mark.parametrize(
    "method,path",
    [
        ("get", "catalog/"),
        ("post", "catalog/initialize/"),
        ("post", "categories/"),
        ("post", "exercises/"),
        ("get", "sessions/"),
        ("post", "sessions/"),
        ("patch", "categories/00000000-0000-0000-0000-000000000000/"),
        ("patch", "exercises/00000000-0000-0000-0000-000000000000/"),
        ("get", "sessions/00000000-0000-0000-0000-000000000000/"),
        ("delete", "sessions/00000000-0000-0000-0000-000000000000/"),
        ("patch", "sessions/00000000-0000-0000-0000-000000000000/"),
        ("post", "sessions/00000000-0000-0000-0000-000000000000/exercises/"),
        ("post", "sessions/00000000-0000-0000-0000-000000000000/copy/"),
        ("patch", "session-exercises/00000000-0000-0000-0000-000000000000/"),
        ("delete", "session-exercises/00000000-0000-0000-0000-000000000000/"),
        ("post", "session-exercises/00000000-0000-0000-0000-000000000000/sets/"),
        ("patch", "sets/00000000-0000-0000-0000-000000000000/"),
        ("delete", "sets/00000000-0000-0000-0000-000000000000/"),
    ],
)
def test_workout_endpoints_require_authentication(method: str, path: str) -> None:
    assert getattr(APIClient(), method)(BASE + path).status_code == 401


def test_model_validation_rejects_cross_owner_workout_exercises() -> None:
    from django.core.exceptions import ValidationError
    from apps.workouts.models import Exercise, Workout, WorkoutExercise

    client, _ = workout_client()
    other, other_user = workout_client("other@example.com")
    create_item(client)
    exercise = Exercise.objects.get(name="Barbell bench press")
    workout = Workout.objects.create(user=other_user, performed_on="2026-10-01")
    item = WorkoutExercise(
        workout=workout,
        exercise=exercise,
        exercise_name="Press",
        category_name="Chest",
        tracking_type="strength",
        weight_unit="kg",
        distance_unit="km",
    )
    with pytest.raises(ValidationError):
        item.full_clean()


@pytest.mark.django_db(transaction=True)
def test_simultaneous_initialization_creates_one_private_catalog() -> None:
    from concurrent.futures import ThreadPoolExecutor
    from threading import Barrier
    from django.db import connection, connections
    from apps.workouts.models import Exercise, ExerciseCategory, WorkoutCatalogState
    from apps.workouts.services import initialize_catalog

    if connection.vendor != "postgresql":
        pytest.skip("Row-lock behavior requires PostgreSQL.")
    user = User.objects.create_user(
        email="concurrent@example.com", password="password-123"
    )
    barrier = Barrier(2)

    def initialize() -> None:
        try:
            barrier.wait(timeout=10)
            initialize_catalog(user)
        finally:
            connections.close_all()

    with ThreadPoolExecutor(max_workers=2) as pool:
        futures = [pool.submit(initialize) for _ in range(2)]
        for future in futures:
            future.result(timeout=15)
    assert ExerciseCategory.objects.filter(user=user).count() == 7
    assert Exercise.objects.filter(category__user=user).count() == 10
    assert WorkoutCatalogState.objects.filter(user=user).count() == 1


def test_archived_history_remains_editable_and_catalog_delete_is_restricted() -> None:
    from django.db.models import RestrictedError
    from apps.workouts.models import Exercise

    client, _ = workout_client()
    session, item = create_item(client)
    exercise_id = client.get(BASE + f"sessions/{session}/").json()["exercises"][0][
        "exercise_id"
    ]
    assert (
        client.patch(
            BASE + f"exercises/{exercise_id}/",
            {"is_active": False, "tracking_type": "duration", "weight_unit": "lb"},
            format="json",
        ).status_code
        == 200
    )
    with pytest.raises(RestrictedError):
        Exercise.objects.get(pk=exercise_id).delete()
    response = client.post(
        BASE + f"session-exercises/{item}/sets/",
        {"weight": 60, "reps": 8},
        format="json",
    )
    assert response.status_code == 201
    saved = client.get(BASE + f"sessions/{session}/").json()["exercises"][0]
    assert saved["tracking_type"] == "strength" and saved["weight_unit"] == "kg"


def test_history_filters_and_pagination_validate_dates_and_remain_owner_scoped() -> (
    None
):
    client, _ = workout_client()
    other, _ = workout_client("other@example.com")
    session, _ = create_item(client)
    _, other_item = create_item(other)
    item = client.get(BASE + f"sessions/{session}/").json()["exercises"][0]
    query = BASE + "sessions/?date_from=2026-10-01&date_to=2026-10-01"
    assert (
        client.get(query + "&exercise_id=" + item["exercise_id"]).json()["count"] == 1
    )
    assert other.get(query + "&exercise_id=" + item["exercise_id"]).status_code == 404
    assert client.get(query + "&exercise_id=bad").status_code == 400
    assert (
        client.get(
            BASE + "sessions/?date_from=2026-10-02&date_to=2026-10-01"
        ).status_code
        == 400
    )
    assert (
        client.get(BASE + "sessions/?date_from=bad&date_to=2026-10-01").status_code
        == 400
    )
    assert client.get(query + "&limit=1&offset=1").json()["results"] == []


def test_catalog_search_is_bounded_and_does_not_seed_on_read() -> None:
    client, _ = workout_client()
    assert client.get(BASE + "catalog/").json() == {"categories": [], "exercises": []}
    client.post(BASE + "catalog/initialize/", {}, format="json")
    results = client.get(BASE + "catalog/?search=BENCH").json()["exercises"]
    assert [e["name"] for e in results] == ["Barbell bench press"]
    assert client.get(BASE + "catalog/?search=" + "x" * 121).status_code == 400
