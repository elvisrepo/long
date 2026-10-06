"""Read-only, owner-scoped progress computed from completed set snapshots."""

from datetime import date
from typing import Any

from django.db.models import (
    Case,
    DecimalField,
    F,
    Max,
    Q,
    QuerySet,
    RowRange,
    Sum,
    Value,
    When,
    Window,
)
from django.db.models.functions import Cast, Round, RowNumber
from decimal import Decimal

from .models import Exercise, WorkoutSet

METRICS = [
    "max_weight",
    "estimated_1rm",
    "max_reps",
    "max_volume",
    "max_weight_reps",
    "workout_volume",
    "workout_reps",
    "max_distance",
    "max_duration",
    "max_speed",
    "best_pace",
]


def completed_sets(exercise: Exercise, through: date) -> QuerySet[WorkoutSet]:
    return (
        WorkoutSet.objects.filter(
            workout_exercise__exercise=exercise,
            workout_exercise__workout__user_id=exercise.category.user_id,
            workout_exercise__workout__performed_on__lte=through,
            is_completed=True,
        )
        .order_by()
        .annotate(
            date=F("workout_exercise__workout__performed_on"),
            tracking_type=F("workout_exercise__tracking_type"),
            weight_unit=F("workout_exercise__weight_unit"),
            distance_unit=F("workout_exercise__distance_unit"),
            workout_id=F("workout_exercise__workout_id"),
            item_id=F("workout_exercise_id"),
            set_id=F("id"),
            name=F("workout_exercise__workout__name"),
            session_order=F("workout_exercise__workout__created_at"),
            item_order=F("workout_exercise__display_order"),
        )
    )


def progress_points(
    rows: QuerySet[WorkoutSet], metric: str, reps: int = 5
) -> QuerySet[Any]:
    number = DecimalField(max_digits=24, decimal_places=3)
    if metric == "estimated_1rm":
        rows = rows.filter(
            tracking_type="strength",
            weight__gt=0,
            weight__lte=10000,
            reps__gte=1,
            reps__lte=10,
        )
        value = Round(
            Case(
                When(reps=1, then=F("weight")),
                default=F("weight")
                * (Value(Decimal(1)) + Cast(F("reps"), number) / Value(Decimal(30))),
                output_field=number,
            ),
            precision=3,
        )
    elif metric in ("max_reps", "workout_reps"):
        rows = rows.filter(
            tracking_type__in=["strength", "bodyweight"], reps__isnull=False
        )
        value = Cast(F("reps"), number)
    elif metric in ("max_volume", "workout_volume"):
        rows = rows.filter(
            tracking_type="strength", weight__isnull=False, reps__isnull=False
        )
        value = Cast(F("weight") * F("reps"), number)
    elif metric in ("max_speed", "best_pace"):
        rows = rows.filter(
            tracking_type="cardio", distance__gt=0, duration_seconds__gt=0
        )
        distance = Cast(F("distance"), number)
        duration = Cast(F("duration_seconds"), number)
        value = Round(
            distance * Value(Decimal(3600)) / duration
            if metric == "max_speed"
            else duration / (distance * Value(Decimal(60))),
            precision=3,
        )
    elif metric == "max_distance":
        rows = rows.filter(tracking_type="cardio", distance__isnull=False)
        value = Cast(F("distance"), number)
    elif metric == "max_duration":
        rows = rows.filter(
            tracking_type__in=["cardio", "duration"], duration_seconds__isnull=False
        )
        value = Cast(F("duration_seconds"), number)
    else:
        rows = rows.filter(
            tracking_type__in=["strength", "bodyweight"], weight__isnull=False
        )
        value = Cast(F("weight"), number)
        if metric == "max_weight_reps":
            rows = rows.filter(tracking_type="strength", reps=reps)
    if metric in ("workout_volume", "workout_reps"):
        return (
            rows.values("date", *PARTITION, "workout_id", "name")
            .annotate(value=Sum(value))
            .order_by("date", *PARTITION, "workout_id")
        )
    return (
        rows.annotate(value=value)
        .annotate(
            rank=Window(
                RowNumber(),
                partition_by=[F(field) for field in [*PARTITION, "date"]],
                order_by=[
                    F("value").asc() if metric == "best_pace" else F("value").desc(),
                    *[F(field).asc() for field in CHRONOLOGY],
                ],
            ),
        )
        .filter(rank=1)
        .order_by("date", *PARTITION)
        .values(*SOURCE_FIELDS, "value")
    )


PARTITION = ["tracking_type", "weight_unit", "distance_unit"]
SOURCE_FIELDS = [
    "date",
    *PARTITION,
    "workout_id",
    "item_id",
    "set_id",
    "name",
    "weight",
    "reps",
]
CHRONOLOGY = [
    "date",
    "session_order",
    "workout_id",
    "item_order",
    "item_id",
    "display_order",
    "set_id",
]


def best_records(rows: QuerySet[WorkoutSet]) -> QuerySet[Any]:
    return (
        rows.filter(tracking_type="strength", weight__isnull=False, reps__isnull=False)
        .order_by(
            *PARTITION,
            "reps",
            "-weight",
            *CHRONOLOGY,
        )
        .distinct(*PARTITION, "reps")
        .values(*SOURCE_FIELDS)
    )


def record_history(rows: QuerySet[WorkoutSet]) -> QuerySet[Any]:
    return (
        rows.filter(tracking_type="strength", weight__isnull=False, reps__isnull=False)
        .annotate(
            previous=Window(
                Max("weight"),
                partition_by=[F(field) for field in [*PARTITION, "reps"]],
                order_by=[F(field).asc() for field in CHRONOLOGY],
                frame=RowRange(start=None, end=-1),
            ),
        )
        .filter(Q(previous__isnull=True) | Q(weight__gt=F("previous")))
        .order_by(*CHRONOLOGY)
        .values(*SOURCE_FIELDS)
    )


def source(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "workout_id": str(row["workout_id"]),
        "item_id": str(row["item_id"]),
        "set_id": str(row["set_id"]),
        "weight": str(row["weight"]) if row["weight"] is not None else None,
        "reps": row["reps"],
    }


def record_json(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "date": row["date"].isoformat(),
        "tracking_type": row["tracking_type"],
        "weight_unit": row["weight_unit"],
        "distance_unit": row["distance_unit"],
        "reps": row["reps"],
        "value": str(row["weight"]),
        "source": source(row),
    }


def point_json(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "date": row["date"].isoformat(),
        "tracking_type": row["tracking_type"],
        "weight_unit": row["weight_unit"],
        "distance_unit": row["distance_unit"],
        "value": str(row["value"]),
        "source": source(row) if "set_id" in row else None,
        **(
            {"session": row["name"], "workout_id": str(row["workout_id"])}
            if "set_id" not in row
            else {}
        ),
    }
