"""Bulk test list: atomic updates/deletes, ownership, locks, stale data and bounds."""

from typing import Any
from uuid import uuid4

import pytest
from rest_framework.test import APIClient

from apps.workouts.models import WorkoutSet
from apps.workouts.serializers import SetSerializer
from tests.test_workouts import BASE, workout_client

pytestmark = pytest.mark.django_db
URL = BASE + "sets/bulk/"


def setup_sets() -> tuple[APIClient, list[dict[str, Any]]]:
    client, _ = workout_client()
    exercise = client.post(BASE + "catalog/initialize/", {}, format="json").json()[
        "exercises"
    ][0]
    rows = []
    for day in ["2026-10-01", "2026-10-02"]:
        workout = client.post(
            BASE + "sessions/", {"performed_on": day}, format="json"
        ).json()
        item = client.post(
            BASE + f"sessions/{workout['id']}/exercises/",
            {"exercise_id": exercise["id"]},
            format="json",
        ).json()
        rows.append(
            client.post(
                BASE + f"session-exercises/{item['id']}/sets/",
                {
                    "weight": "70",
                    "reps": 5,
                    "comment": "Keep me",
                    "is_completed": False,
                },
                format="json",
            ).json()
        )
    return client, rows


def payload(rows: list[dict[str, Any]], **kwargs: Any) -> dict[str, Any]:
    return {"sets": [{"id": row["id"], "expected": row} for row in rows], **kwargs}


def test_bulk_updates_sets_across_sessions_without_changing_other_fields() -> None:
    client, rows = setup_sets()
    response = client.post(
        URL,
        payload(rows, action="update", changes={"is_completed": True}),
        format="json",
    )
    assert response.status_code == 200
    assert response.json()["affected_count"] == 2
    for row in rows:
        saved = SetSerializer(WorkoutSet.objects.get(pk=row["id"])).data
        assert saved == {**row, "is_completed": True}


def test_numeric_edits_reject_mixed_saved_units_without_partial_changes() -> None:
    client, rows = setup_sets()
    item = WorkoutSet.objects.get(pk=rows[1]["id"]).workout_exercise
    item.weight_unit = "lb"
    item.save()
    response = client.post(
        URL, payload(rows, action="update", changes={"weight": "80"}), format="json"
    )
    assert response.status_code == 400
    assert list(WorkoutSet.objects.values_list("weight", flat=True)) == [70, 70]


@pytest.mark.parametrize("action", ["update", "delete"])
def test_stale_preview_rejects_entire_batch(action: str) -> None:
    client, rows = setup_sets()
    WorkoutSet.objects.filter(pk=rows[1]["id"]).update(comment="Changed elsewhere")
    kwargs = {"changes": {"reps": 6}} if action == "update" else {}
    response = client.post(URL, payload(rows, action=action, **kwargs), format="json")
    assert response.status_code == 409
    assert WorkoutSet.objects.count() == 2
    assert list(WorkoutSet.objects.values_list("reps", flat=True)) == [5, 5]


def test_delete_removes_only_selected_sets_not_exercises_or_workouts() -> None:
    client, rows = setup_sets()
    first = WorkoutSet.objects.get(pk=rows[0]["id"])
    item = first.workout_exercise
    response = client.post(URL, payload(rows[:1], action="delete"), format="json")
    assert response.status_code == 200
    assert response.json() == {"affected_count": 1}
    assert not WorkoutSet.objects.filter(pk=first.pk).exists()
    assert item.workout.exercises.filter(pk=item.pk).exists()
    assert WorkoutSet.objects.filter(pk=rows[1]["id"]).exists()


@pytest.mark.parametrize("action", ["update", "delete"])
def test_finished_session_blocks_whole_batch_until_reopened(action: str) -> None:
    client, rows = setup_sets()
    workout = WorkoutSet.objects.get(pk=rows[1]["id"]).workout_exercise.workout
    workout.is_finished = True
    workout.save()
    kwargs = {"changes": {"is_completed": True}} if action == "update" else {}
    response = client.post(URL, payload(rows, action=action, **kwargs), format="json")
    assert response.status_code == 400
    assert WorkoutSet.objects.count() == 2
    assert not WorkoutSet.objects.filter(is_completed=True).exists()
    workout.is_finished = False
    workout.save()
    assert (
        client.post(
            URL, payload(rows, action=action, **kwargs), format="json"
        ).status_code
        == 200
    )


def test_foreign_missing_and_inconsistent_ownership_never_partially_write() -> None:
    client, rows = setup_sets()
    foreign, other = workout_client("foreign@example.com")
    assert (
        foreign.post(URL, payload(rows, action="delete"), format="json").status_code
        == 404
    )
    missing = {**rows[1], "id": str(uuid4())}
    assert (
        client.post(
            URL, payload([rows[0], missing], action="delete"), format="json"
        ).status_code
        == 404
    )
    category = WorkoutSet.objects.get(
        pk=rows[1]["id"]
    ).workout_exercise.exercise.category
    category.user = other
    category.save()
    assert (
        client.post(URL, payload(rows, action="delete"), format="json").status_code
        == 404
    )
    assert WorkoutSet.objects.count() == 2
    assert APIClient().post(URL, {}, format="json").status_code == 401


@pytest.mark.parametrize(
    "changes",
    [
        {"reps": 0},
        {"distance": "2"},
        {"weight": None, "is_completed": True},
        {"display_order": 4},
        {"surprise": 1},
        {},
        {"comment": "x" * 2001},
    ],
)
def test_invalid_shared_edit_changes_nothing(changes: dict[str, Any]) -> None:
    client, rows = setup_sets()
    assert (
        client.post(
            URL, payload(rows, action="update", changes=changes), format="json"
        ).status_code
        == 400
    )
    assert {
        str(row.pk): dict(SetSerializer(row).data) for row in WorkoutSet.objects.all()
    } == {row["id"]: row for row in rows}


@pytest.mark.parametrize("selection", [[], "duplicate", "too-many", "no-expected"])
def test_selection_bounds_and_expected_snapshot_required(selection: str | list) -> None:
    client, rows = setup_sets()
    data = payload(rows, action="delete")
    if selection == "duplicate":
        data["sets"] = [data["sets"][0]] * 2
    elif selection == "too-many":
        data["sets"] = [{"id": str(uuid4()), "expected": {}} for _ in range(101)]
    elif selection == "no-expected":
        data["sets"] = [{"id": rows[0]["id"]}]
    else:
        data["sets"] = []
    assert client.post(URL, data, format="json").status_code == 400
    assert WorkoutSet.objects.count() == 2


def test_completion_validates_every_combined_row_before_saving() -> None:
    client, rows = setup_sets()
    WorkoutSet.objects.filter(pk=rows[1]["id"]).update(weight=None)
    rows[1] = dict(SetSerializer(WorkoutSet.objects.get(pk=rows[1]["id"])).data)
    response = client.post(
        URL,
        payload(rows, action="update", changes={"is_completed": True}),
        format="json",
    )
    assert response.status_code == 400
    assert not WorkoutSet.objects.filter(is_completed=True).exists()


def test_bulk_corrections_recompute_goal_progress_and_statistics() -> None:
    client, rows = setup_sets()
    exercise = WorkoutSet.objects.get(pk=rows[0]["id"]).workout_exercise.exercise
    goal_url = BASE + f"exercises/{exercise.pk}/goals/"
    assert (
        client.post(
            goal_url, {"target_weight": "70", "target_reps": 5}, format="json"
        ).status_code
        == 201
    )
    assert not client.get(goal_url, {"date_to": "2026-10-02"}).json()[0]["achieved"]
    assert (
        client.post(
            URL,
            payload(rows, action="update", changes={"is_completed": True}),
            format="json",
        ).status_code
        == 200
    )
    assert client.get(goal_url, {"date_to": "2026-10-02"}).json()[0]["achieved"]
    stats_url = BASE + f"exercises/{exercise.pk}/stats/?date_to=2026-10-02"
    assert client.get(stats_url).json()["groups"][0]["set_count"] == 2
    refreshed = [
        dict(SetSerializer(WorkoutSet.objects.get(pk=row["id"])).data) for row in rows
    ]
    assert (
        client.post(URL, payload(refreshed, action="delete"), format="json").status_code
        == 200
    )
    assert not client.get(goal_url, {"date_to": "2026-10-02"}).json()[0]["achieved"]
    assert client.get(stats_url).json()["groups"] == []


def test_unknown_nested_fields_and_delete_changes_are_rejected() -> None:
    client, rows = setup_sets()
    data = payload(rows, action="delete")
    data["sets"][0]["unexpected"] = True
    assert client.post(URL, data, format="json").status_code == 400
    assert (
        client.post(
            URL, payload(rows, action="delete", changes={}), format="json"
        ).status_code
        == 400
    )
    assert (
        client.post(
            URL, payload(rows, action="delete", unexpected=True), format="json"
        ).status_code
        == 400
    )
    assert WorkoutSet.objects.count() == 2
