from datetime import date
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


def start_day(day: RoutineDay, performed_on: date) -> Workout:
    """Independent planned session: no template FK or completion/performance data."""
    workout = Workout.objects.create(
        user=day.routine.user,
        performed_on=performed_on,
        name=f"{day.routine.name} · {day.name}"[:120],
        notes=day.notes,
    )
    for item in day.exercises.all():
        saved = WorkoutExercise.objects.create(
            workout=workout,
            **{field: getattr(item, field) for field in SNAPSHOT_FIELDS},
        )
        WorkoutSet.objects.bulk_create(
            [
                WorkoutSet(
                    workout_exercise=saved,
                    is_completed=False,
                    **{field: getattr(row, field) for field in QUANTITY_FIELDS},
                )
                for row in item.sets.all()
            ]
        )
    return workout
