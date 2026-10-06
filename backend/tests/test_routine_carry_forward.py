"""Routine start: read-only preview, blank-only carry, ambiguity, stale/auth safety."""

import pytest
from rest_framework.test import APIClient
from apps.users.models import User
from apps.workouts.models import (
    Exercise,
    ExerciseCategory,
    WorkoutRoutine,
    RoutineDay,
    RoutineExercise,
    RoutineSet,
    Workout,
    WorkoutExercise,
    WorkoutSet,
)

pytestmark = pytest.mark.django_db
BASE = "/api/v1/workouts/"


def fixture() -> tuple[APIClient, RoutineDay, RoutineExercise, WorkoutExercise]:
    user = User.objects.create_user(email="carry@example.com", password="password-123")
    client = APIClient()
    client.force_authenticate(user)
    category = ExerciseCategory.objects.create(user=user, name="Chest")
    exercise = Exercise.objects.create(category=category, name="Bench")
    routine = WorkoutRoutine.objects.create(user=user, name="Plan")
    day = RoutineDay.objects.create(routine=routine, name="Push", notes="Technique")
    item = RoutineExercise.objects.create(
        day=day,
        exercise=exercise,
        exercise_name="Bench",
        category_name="Chest",
        tracking_type="strength",
        weight_unit="kg",
        distance_unit="km",
    )
    RoutineSet.objects.create(
        routine_exercise=item, weight=40, reps=5, display_order=10
    )
    RoutineSet.objects.create(
        routine_exercise=item, weight=None, reps=8, display_order=20
    )
    workout = Workout.objects.create(user=user, performed_on="2026-10-02")
    past = WorkoutExercise.objects.create(
        workout=workout,
        exercise=exercise,
        exercise_name="Bench",
        category_name="Chest",
        tracking_type="strength",
        weight_unit="kg",
        distance_unit="km",
    )
    WorkoutSet.objects.create(
        workout_exercise=past, weight=20, reps=5, display_order=10, comment="Private"
    )
    WorkoutSet.objects.create(
        workout_exercise=past, weight=100, reps=6, display_order=20, comment="Assisted"
    )
    return client, day, item, past


def test_preview_fills_only_blanks_from_prior_completed_matching_sets_without_writes() -> (
    None
):
    client, day, item, past = fixture()
    count = Workout.objects.count()
    response = client.get(
        BASE + f"routine-days/{day.pk}/preview/",
        {
            "performed_on": "2026-10-03",
            "carry_forward": "true",
        },
    )
    assert response.status_code == 200
    plan = response.json()
    warmup, work = plan["exercises"][0]["sets"]
    assert warmup["weight"] == "40.000" and warmup["reps"] == 5
    assert warmup["source"] is None
    assert work["weight"] == "100.000" and work["reps"] == 8
    assert work["source"]["date"] == "2026-10-02"
    assert work["source"]["fields"] == ["weight"]
    assert "comment" not in work and "is_completed" not in work
    assert len(plan["preview_token"]) == 64
    assert Workout.objects.count() == count
    assert item.sets.last().weight is None and past.sets.last().comment == "Assisted"


def test_start_uses_confirmed_preview_values_and_selection_without_changing_sources() -> (
    None
):
    client, day, item, past = fixture()
    item.group_name = "Circuit"
    item.group_colour = "#db2777"
    item.save()
    plan = client.get(
        BASE + f"routine-days/{day.pk}/preview/",
        {
            "performed_on": "2026-10-03",
            "carry_forward": "true",
        },
    ).json()
    work = plan["exercises"][0]["sets"][1]
    response = client.post(
        BASE + f"routine-days/{day.pk}/start/",
        {
            "performed_on": "2026-10-03",
            "carry_forward": True,
            "preview_token": plan["preview_token"],
            "selection": [{"item_id": str(item.pk), "set_ids": [work["id"]]}],
        },
        format="json",
    )
    assert response.status_code == 201
    saved = response.json()
    assert saved["notes"] == "Technique" and not saved["is_finished"]
    assert len(saved["exercises"][0]["sets"]) == 1
    assert saved["exercises"][0]["group_name"] == "Circuit"
    assert saved["exercises"][0]["group_colour"] == "#db2777"
    row = saved["exercises"][0]["sets"][0]
    assert row["weight"] == "100.000" and row["reps"] == 8
    assert not row["is_completed"] and row["comment"] == ""
    assert item.sets.last().weight is None
    assert past.sets.last().reps == 6 and past.sets.last().comment == "Assisted"


@pytest.mark.parametrize(
    "case", ["planned", "same_day", "future", "weight_unit", "distance_unit", "type"]
)
def test_ineligible_history_never_fills_blanks(case: str) -> None:
    client, day, _, past = fixture()
    if case == "planned":
        past.sets.update(is_completed=False)
    elif case in {"same_day", "future"}:
        past.workout.performed_on = "2026-10-03" if case == "same_day" else "2026-10-04"
        past.workout.save()
    else:
        setattr(
            past,
            {
                "weight_unit": "weight_unit",
                "distance_unit": "distance_unit",
                "type": "tracking_type",
            }[case],
            {"weight_unit": "lb", "distance_unit": "mi", "type": "duration"}[case],
        )
        past.save()
    plan = client.get(
        BASE + f"routine-days/{day.pk}/preview/",
        {"performed_on": "2026-10-03", "carry_forward": True},
    ).json()
    assert plan["exercises"][0]["sets"][1]["weight"] is None
    assert plan["exercises"][0]["sets"][1]["source"] is None


def test_fixed_zero_and_completed_set_positions_are_not_shifted() -> None:
    client, day, item, past = fixture()
    work = item.sets.last()
    work.weight = 0
    work.reps = None
    work.save()
    warmup = item.sets.first()
    warmup.weight = None
    warmup.save()
    past.sets.filter(display_order=10).update(is_completed=False)
    plan = client.get(
        BASE + f"routine-days/{day.pk}/preview/",
        {"performed_on": "2026-10-03", "carry_forward": True},
    ).json()
    warm, row = plan["exercises"][0]["sets"]
    assert warm["weight"] is None
    assert row["weight"] == "0.000" and row["reps"] == 6
    assert row["source"]["fields"] == ["reps"]


@pytest.mark.parametrize("duplicate", ["template", "history"])
def test_ambiguous_occurrences_keep_blanks_and_explain_why(duplicate: str) -> None:
    client, day, item, past = fixture()
    original_id = str(item.pk)
    if duplicate == "template":
        item.pk = None
        item.save()
    else:
        past.pk = None
        past.save()
    plan = client.get(
        BASE + f"routine-days/{day.pk}/preview/",
        {"performed_on": "2026-10-03", "carry_forward": True},
    ).json()
    original = next(row for row in plan["exercises"] if row["id"] == original_id)
    assert original["sets"][1]["weight"] is None
    assert "no automatic matching" in original["carry_reason"]


@pytest.mark.parametrize("changed", ["template", "performance"])
def test_stale_preview_rejects_without_creating_then_refresh_succeeds(
    changed: str,
) -> None:
    client, day, item, past = fixture()
    params = {"performed_on": "2026-10-03", "carry_forward": True}
    url = BASE + f"routine-days/{day.pk}"
    preview = client.get(url + "/preview/", params).json()
    row = item.sets.first() if changed == "template" else past.sets.last()
    row.weight = 110
    row.save()
    count = Workout.objects.count()
    body = {**params, "preview_token": preview["preview_token"]}
    assert client.post(url + "/start/", body, format="json").status_code == 409
    assert Workout.objects.count() == count
    body["preview_token"] = client.get(url + "/preview/", params).json()[
        "preview_token"
    ]
    assert client.post(url + "/start/", body, format="json").status_code == 201


def test_default_preview_auth_archives_and_invalid_selections() -> None:
    client, day, item, _ = fixture()
    params = {"performed_on": "2026-10-03"}
    url = BASE + f"routine-days/{day.pk}"
    plan = client.get(url + "/preview/", params).json()
    assert (
        not plan["carry_forward"] and plan["exercises"][0]["sets"][1]["weight"] is None
    )
    other = APIClient()
    other.force_authenticate(
        User.objects.create_user(email="other@example.com", password="password-123")
    )
    assert other.get(url + "/preview/", params).status_code == 404
    assert APIClient().get(url + "/preview/", params).status_code == 401
    count = Workout.objects.count()
    for extra in (
        {"carry_forward": True},
        {"selection": []},
        {"unexpected": 1},
        {
            "selection": [
                {
                    "item_id": str(item.pk),
                    "set_ids": ["00000000-0000-0000-0000-000000000000"],
                }
            ]
        },
    ):
        assert (
            client.post(url + "/start/", {**params, **extra}, format="json").status_code
            == 400
        )
    assert Workout.objects.count() == count
    day.routine.is_active = False
    day.routine.save()
    assert client.get(url + "/preview/", params).status_code == 400


@pytest.mark.parametrize(
    "kind,quantities",
    [
        ("bodyweight", {"weight": "5.000", "reps": 10}),
        ("cardio", {"distance": "3.000", "duration_seconds": 600}),
        ("duration", {"duration_seconds": 60}),
    ],
)
def test_all_tracking_types_carry_only_their_applicable_quantities(
    kind: str, quantities: dict
) -> None:
    client, day, item, past = fixture()
    item.tracking_type = past.tracking_type = kind
    item.save()
    past.save()
    item.sets.all().delete()
    past.sets.all().delete()
    RoutineSet.objects.create(routine_exercise=item)
    WorkoutSet.objects.create(workout_exercise=past, **quantities)
    row = client.get(
        BASE + f"routine-days/{day.pk}/preview/",
        {"performed_on": "2026-10-03", "carry_forward": True},
    ).json()["exercises"][0]["sets"][0]
    for field, value in quantities.items():
        assert row[field] == value
    assert set(row["source"]["fields"]) == set(quantities)
