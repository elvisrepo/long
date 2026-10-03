from datetime import date
from typing import Any
from rest_framework.exceptions import ValidationError
from .routine_serializers import RoutineExerciseSerializer
from .models import (
    RoutineDay,
    RoutineExercise,
    RoutineSet,
    Workout,
    WorkoutExercise,
    WorkoutSet,
)

SNAPSHOT_FIELDS = (
    "exercise_id",
    "exercise_name",
    "group_name",
    "group_colour",
    "category_name",
    "tracking_type",
    "weight_unit",
    "distance_unit",
    "display_order",
)
QUANTITY_FIELDS = ("weight", "reps", "distance", "duration_seconds", "display_order")


def capture_day(day: RoutineDay, source: Workout) -> None:
    """Replace only this template inside the owner-locked mutation transaction."""
    day.exercises.all().delete()
    for item in source.exercises.all():
        saved = RoutineExercise.objects.create(
            day=day, **{field: getattr(item, field) for field in SNAPSHOT_FIELDS}
        )
        RoutineSet.objects.bulk_create(
            [
                RoutineSet(
                    routine_exercise=saved,
                    **{field: getattr(row, field) for field in QUANTITY_FIELDS},
                )
                for row in item.sets.all()
            ]
        )


def start_day(
    day: RoutineDay,
    performed_on: date,
    plan: dict[str, Any] | None = None,
    selection: list[dict[str, Any]] | None = None,
) -> Workout:
    """Independent planned session: no template FK or completion/performance data."""
    items = (
        plan["exercises"]
        if plan is not None
        else RoutineExerciseSerializer(day.exercises.all(), many=True).data
    )
    chosen = (
        {
            str(row["item_id"]): {str(pk) for pk in row["set_ids"]}
            if "set_ids" in row
            else None
            for row in selection
        }
        if selection is not None
        else None
    )
    if chosen is not None:
        if not chosen or not chosen.keys() <= {row["id"] for row in items}:
            raise ValidationError("Choose occurrences from this routine day.")
        items = [row for row in items if row["id"] in chosen]
        for row in items:
            ids = chosen[row["id"]]
            if ids is not None and not ids <= {s["id"] for s in row["sets"]}:
                raise ValidationError("Choose sets from their routine occurrence.")
    workout = Workout.objects.create(
        user=day.routine.user,
        performed_on=performed_on,
        name=f"{day.routine.name} · {day.name}"[:120],
        notes=day.notes,
    )
    for item in items:
        set_ids = chosen[item["id"]] if chosen is not None else None
        saved = WorkoutExercise.objects.create(
            workout=workout,
            **{field: item[field] for field in SNAPSHOT_FIELDS},
        )
        WorkoutSet.objects.bulk_create(
            [
                WorkoutSet(
                    workout_exercise=saved,
                    is_completed=False,
                    **{field: row[field] for field in QUANTITY_FIELDS},
                )
                for row in item["sets"]
                if set_ids is None or row["id"] in set_ids
            ]
        )
    return workout
