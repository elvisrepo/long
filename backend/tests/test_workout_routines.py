"""Routine tests: private catalog, snapshots, start/reset, replace/archive, lifecycle."""

import pytest
from rest_framework.test import APIClient
from apps.users.models import User

pytestmark = pytest.mark.django_db
BASE = "/api/v1/workouts/"


def owner(email: str = "routine@example.test") -> tuple[APIClient, User]:
    user = User.objects.create_user(email=email, password="password-123")
    client = APIClient()
    client.force_authenticate(user)
    return client, user


def test_routines_are_private_editable_and_archive_instead_of_deleting() -> None:
    client, _ = owner()
    other, _ = owner("other@example.test")
    response = client.post(
        BASE + "routines/", {"name": "Push / Pull", "notes": "My plan"}, format="json"
    )
    assert response.status_code == 201
    routine = response.json()
    assert routine["days"] == [] and routine["is_active"]
    assert client.get(BASE + "routines/").json() == [routine]
    assert other.get(BASE + "routines/").json() == []
    assert (
        other.patch(
            BASE + f"routines/{routine['id']}/", {"name": "Stolen"}, format="json"
        ).status_code
        == 404
    )
    assert (
        client.patch(
            BASE + f"routines/{routine['id']}/",
            {"name": "Upper / Lower", "is_active": False},
            format="json",
        ).status_code
        == 200
    )
    archived = client.get(BASE + "routines/").json()[0]
    assert archived["name"] == "Upper / Lower" and not archived["is_active"]
    assert (
        client.post(
            BASE + "routines/", {"name": " upper / lower "}, format="json"
        ).status_code
        == 400
    )


def saved_workout(client: APIClient) -> tuple[str, str]:
    catalog = client.post(BASE + "catalog/initialize/", {}, format="json").json()
    exercise = next(
        e for e in catalog["exercises"] if e["name"] == "Barbell bench press"
    )
    workout = client.post(
        BASE + "sessions/",
        {"performed_on": "2026-10-02", "notes": "Sore today"},
        format="json",
    ).json()
    item = client.post(
        BASE + f"sessions/{workout['id']}/exercises/",
        {"exercise_id": exercise["id"], "display_order": 5},
        format="json",
    ).json()
    client.post(
        BASE + f"session-exercises/{item['id']}/sets/",
        {"weight": 60, "reps": 8, "comment": "Assisted", "display_order": 7},
        format="json",
    )
    return workout["id"], exercise["id"]


def test_day_capture_and_start_preserve_snapshots_but_not_performance() -> None:
    client, _ = owner()
    source, exercise = saved_workout(client)
    routine = client.post(
        BASE + "routines/", {"name": "Three days"}, format="json"
    ).json()
    response = client.post(
        BASE + f"routines/{routine['id']}/days/",
        {"name": "Push", "source_workout_id": source, "notes": "Warm up first"},
        format="json",
    )
    assert response.status_code == 201
    day = response.json()
    saved = day["exercises"][0]
    assert saved["display_order"] == 5 and saved["sets"][0]["display_order"] == 7
    assert saved["sets"][0]["weight"] == "60.000"
    assert "comment" not in saved["sets"][0] and "is_completed" not in saved["sets"][0]
    client.patch(
        BASE + f"exercises/{exercise}/",
        {"name": "Renamed", "weight_unit": "lb", "is_active": False},
        format="json",
    )
    response = client.post(
        BASE + f"routine-days/{day['id']}/start/",
        {"performed_on": "2026-10-05"},
        format="json",
    )
    assert response.status_code == 201
    planned = response.json()
    assert (
        planned["performed_on"] == "2026-10-05" and planned["completed_set_count"] == 0
    )
    assert planned["name"] == "Three days · Push" and not planned["is_finished"]
    assert planned["notes"] == "Warm up first"
    copied = planned["exercises"][0]
    assert (
        copied["exercise_name"] == "Barbell bench press"
        and copied["weight_unit"] == "kg"
    )
    assert (
        copied["id"] != saved["id"]
        and copied["sets"][0]["id"] != saved["sets"][0]["id"]
    )
    assert not copied["sets"][0]["is_completed"] and copied["sets"][0]["comment"] == ""
    client.patch(
        BASE + f"sets/{copied['sets'][0]['id']}/", {"weight": 70}, format="json"
    )
    assert (
        client.get(BASE + "routines/").json()[0]["days"][0]["exercises"][0]["sets"][0][
            "weight"
        ]
        == "60.000"
    )


def test_replacing_or_removing_a_day_never_changes_existing_sessions() -> None:
    client, _ = owner()
    source, _ = saved_workout(client)
    routine = client.post(BASE + "routines/", {"name": "Plan"}, format="json").json()
    day = client.post(
        BASE + f"routines/{routine['id']}/days/",
        {"name": "A", "source_workout_id": source},
        format="json",
    ).json()
    start = BASE + f"routine-days/{day['id']}/start/"
    planned = client.post(start, {"performed_on": "2026-10-03"}, format="json").json()
    source_set = client.get(BASE + f"sessions/{source}/").json()["exercises"][0][
        "sets"
    ][0]["id"]
    client.patch(BASE + f"sets/{source_set}/", {"weight": 80}, format="json")
    detail = BASE + f"routine-days/{day['id']}/"
    replaced = client.patch(
        detail,
        {"source_workout_id": source, "name": "B", "display_order": 0},
        format="json",
    )
    assert replaced.status_code == 200
    assert replaced.json()["exercises"][0]["sets"][0]["weight"] == "80.000"
    assert (
        client.get(BASE + f"sessions/{planned['id']}/").json()["exercises"][0]["sets"][
            0
        ]["weight"]
        == "60.000"
    )
    assert client.delete(BASE + f"sessions/{source}/").status_code == 204
    assert (
        client.post(start, {"performed_on": "2026-10-04"}, format="json").status_code
        == 201
    )
    assert client.delete(detail).status_code == 204
    assert client.get(BASE + f"sessions/{planned['id']}/").status_code == 200
    assert client.get(BASE + "routines/").json()[0]["days"] == []


def test_foreign_sources_and_day_actions_are_rejected_and_archives_preserved() -> None:
    client, _ = owner()
    other, _ = owner("other@example.test")
    source, _ = saved_workout(client)
    foreign, _ = saved_workout(other)
    routine = client.post(BASE + "routines/", {"name": "Plan"}, format="json").json()
    create = BASE + f"routines/{routine['id']}/days/"
    assert (
        client.post(
            create, {"name": "A", "source_workout_id": foreign}, format="json"
        ).status_code
        == 400
    )
    assert (
        other.post(
            create, {"name": "A", "source_workout_id": foreign}, format="json"
        ).status_code
        == 404
    )
    day = client.post(
        create, {"name": "A", "source_workout_id": source}, format="json"
    ).json()
    detail = BASE + f"routine-days/{day['id']}/"
    assert other.patch(detail, {"name": "Stolen"}, format="json").status_code == 404
    assert other.delete(detail).status_code == 404
    assert (
        other.post(
            detail + "start/", {"performed_on": "2026-10-03"}, format="json"
        ).status_code
        == 404
    )
    assert (
        client.patch(detail, {"source_workout_id": foreign}, format="json").status_code
        == 400
    )
    assert (
        client.post(
            create, {"name": " a ", "source_workout_id": source}, format="json"
        ).status_code
        == 400
    )
    client.patch(
        BASE + f"routines/{routine['id']}/", {"is_active": False}, format="json"
    )
    assert (
        client.post(
            detail + "start/", {"performed_on": "2026-10-03"}, format="json"
        ).status_code
        == 400
    )
    assert client.patch(detail, {"name": "B"}, format="json").status_code == 400
    assert client.delete(detail).status_code == 400
    assert (
        client.post(
            create, {"name": "C", "source_workout_id": source}, format="json"
        ).status_code
        == 400
    )
    assert len(client.get(BASE + "routines/").json()[0]["days"]) == 1
    client.patch(
        BASE + f"routines/{routine['id']}/", {"is_active": True}, format="json"
    )
    assert (
        client.post(
            detail + "start/", {"performed_on": "2026-10-03"}, format="json"
        ).status_code
        == 201
    )


def test_routine_export_and_account_deletion_include_templates() -> None:
    import json
    from apps.users.account import account_export, delete_account
    from apps.workouts.models import (
        WorkoutRoutine,
        RoutineDay,
        RoutineExercise,
        RoutineSet,
    )

    client, user = owner()
    source, _ = saved_workout(client)
    routine = client.post(BASE + "routines/", {"name": "Plan"}, format="json").json()
    client.post(
        BASE + f"routines/{routine['id']}/days/",
        {"name": "A", "source_workout_id": source},
        format="json",
    )
    data = json.loads("".join(account_export(user)))
    assert data["workout_routines"][0]["id"] == routine["id"]
    assert (
        len(data["routine_days"])
        == len(data["routine_exercises"])
        == len(data["routine_sets"])
        == 1
    )
    delete_account(user=user, password="password-123")
    for model in (WorkoutRoutine, RoutineDay, RoutineExercise, RoutineSet):
        assert not model.objects.exists()


def test_routine_models_validate_owner_and_type_for_explicit_orm_writers() -> None:
    from django.core.exceptions import ValidationError
    from apps.workouts.models import RoutineDay, RoutineExercise, RoutineSet, Exercise

    client, _ = owner()
    other, _ = owner("other@example.test")
    source, _ = saved_workout(client)
    _, foreign = saved_workout(other)
    routine = client.post(BASE + "routines/", {"name": "Plan"}, format="json").json()
    day_id = client.post(
        BASE + f"routines/{routine['id']}/days/",
        {"name": "A", "source_workout_id": source},
        format="json",
    ).json()["id"]
    day = RoutineDay.objects.get(pk=day_id)
    invalid = RoutineExercise(day=day, exercise=Exercise.objects.get(pk=foreign))
    with pytest.raises(ValidationError, match="owner"):
        invalid.clean()
    item = day.exercises.get()
    with pytest.raises(ValidationError, match="not used"):
        RoutineSet(routine_exercise=item, duration_seconds=45).full_clean()
    RoutineSet(
        routine_exercise=item
    ).full_clean()  # Unspecified planned quantities are valid.


@pytest.mark.parametrize(
    "method,path",
    [
        ("get", "routines/"),
        ("post", "routines/"),
        ("patch", "routines/00000000-0000-0000-0000-000000000000/"),
        ("post", "routines/00000000-0000-0000-0000-000000000000/days/"),
        ("patch", "routine-days/00000000-0000-0000-0000-000000000000/"),
        ("delete", "routine-days/00000000-0000-0000-0000-000000000000/"),
        ("post", "routine-days/00000000-0000-0000-0000-000000000000/start/"),
    ],
)
def test_routine_routes_require_authentication(method: str, path: str) -> None:
    assert (
        getattr(APIClient(), method)(BASE + path, {}, format="json").status_code == 401
    )


def test_day_inputs_are_bounded_and_snapshot_fields_are_server_managed() -> None:
    client, _ = owner()
    source, _ = saved_workout(client)
    routine = client.post(
        BASE + "routines/", {"name": "Plan", "is_active": False}, format="json"
    ).json()
    assert routine["is_active"]
    create = BASE + f"routines/{routine['id']}/days/"
    assert client.post(create, {"name": "A"}, format="json").status_code == 400
    empty = client.post(
        BASE + "sessions/", {"performed_on": "2026-10-02"}, format="json"
    ).json()
    assert (
        client.post(
            create, {"name": "A", "source_workout_id": empty["id"]}, format="json"
        ).status_code
        == 400
    )
    assert (
        client.post(
            create,
            {"name": "A", "source_workout_id": source, "notes": "x" * 2001},
            format="json",
        ).status_code
        == 400
    )
    assert (
        client.post(
            create,
            {"name": "A", "source_workout_id": source, "display_order": -1},
            format="json",
        ).status_code
        == 400
    )
    day = client.post(
        create,
        {"name": "A", "source_workout_id": source, "exercises": []},
        format="json",
    ).json()
    changed = client.patch(
        BASE + f"routine-days/{day['id']}/",
        {"exercises": [], "routine_id": "00000000-0000-0000-0000-000000000000"},
        format="json",
    ).json()
    assert changed["exercises"] == day["exercises"]
    start = BASE + f"routine-days/{day['id']}/start/"
    assert (
        client.post(start, {"performed_on": "2026-02-30"}, format="json").status_code
        == 400
    )
