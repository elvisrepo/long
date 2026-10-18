"""Bounded summaries of logged routines; labels are untrusted user data."""

from collections import defaultdict
from datetime import date
from typing import Any

from django.contrib.auth.models import AbstractBaseUser
from django.db.models import Q, QuerySet

from apps.diet.models import DietEntry, DietFood
from apps.recovery.models import RecoveryEntry, RecoveryTool
from apps.stretching.models import StretchEntry, StretchExercise, StretchPreferences

DETAIL_LIMIT = 20


def tracker_details(user: AbstractBaseUser, dates: list[date]) -> dict[str, Any]:
    shared = Q(user=user) | Q(user__isnull=True)
    stretches = StretchExercise.objects.filter(shared, is_active=True)
    preferences = StretchPreferences.objects.filter(user=user).first()
    if preferences:
        if not preferences.show_shared_exercises:
            stretches = stretches.filter(user=user)
        stretches = stretches.exclude(pk__in=preferences.hidden_exercises.values("pk"))
    sources = {
        "diet": (
            DietEntry.objects.filter(user=user, food__section__user=user),
            "food",
            "food__section__name",
            DietFood.objects.filter(
                section__user=user, section__is_active=True, is_active=True
            ).count(),
        ),
        "recovery": (
            RecoveryEntry.objects.filter(user=user).filter(
                Q(tool__user=user) | Q(tool__user__isnull=True)
            ),
            "tool",
            None,
            RecoveryTool.objects.filter(shared, is_active=True).count(),
        ),
        "stretching": (
            StretchEntry.objects.filter(user=user).filter(
                Q(exercise__user=user) | Q(exercise__user__isnull=True)
            ),
            "exercise",
            "exercise__phase",
            stretches.count(),
        ),
    }
    return {
        key: _details(query, relation, group, configured, dates)
        for key, (query, relation, group, configured) in sources.items()
    }


def _details(
    query: QuerySet,
    relation: str,
    group: str | None,
    configured: int,
    dates: list[date],
) -> dict[str, Any]:
    fields = [f"{relation}_id", f"{relation}__name", "performed_on"]
    if group:
        fields.append(group)
    items: dict[Any, dict[str, Any]] = {}
    for row in query.filter(performed_on__range=(dates[0], dates[-1])).values(*fields):
        item = items.setdefault(
            row[f"{relation}_id"],
            {
                "name": row[f"{relation}__name"][:120],
                "group": row[group][:120] if group else None,
                "current_logged_days": 0,
                "previous_logged_days": 0,
                "logged_dates": [],
            },
        )
        item[
            "current_logged_days"
            if row["performed_on"] >= dates[7]
            else "previous_logged_days"
        ] += 1
        item["logged_dates"].append(row["performed_on"].isoformat())
    ordered = sorted(
        items.values(),
        key=lambda item: (
            -item["current_logged_days"],
            -item["previous_logged_days"],
            item["name"],
        ),
    )
    last = (
        query.filter(performed_on__lte=dates[-1])
        .order_by("-performed_on")
        .values_list("performed_on", flat=True)
        .first()
    )
    counts: dict[date, int] = defaultdict(int)
    for item in ordered:
        for day in item["logged_dates"]:
            counts[date.fromisoformat(day)] += 1
    return {
        "details": ordered[:DETAIL_LIMIT],
        "coverage": {
            "configured_items": configured,
            "last_logged_on": last.isoformat() if last else None,
            "omitted_items": max(0, len(ordered) - DETAIL_LIMIT),
        },
        "counts": dict(counts),
    }


def workout_details(user: AbstractBaseUser, dates: list[date]) -> dict[str, Any]:
    from apps.workouts.models import Workout, WorkoutSet

    workouts = Workout.objects.filter(
        user=user, performed_on__range=(dates[0], dates[-1])
    )
    sessions: dict[str, Any] = {}
    for period_name, days in [("previous", dates[:7]), ("current", dates[7:])]:
        period = workouts.filter(performed_on__range=(days[0], days[-1]))
        finished = period.filter(is_finished=True)
        durations = list(
            finished.exclude(duration_seconds=None).values_list(
                "duration_seconds", flat=True
            )
        )
        sessions[period_name] = {
            "recorded": period.count(),
            "unfinished": period.filter(is_finished=False).count(),
            "finished_with_duration": len(durations),
            "recorded_finished_duration_seconds": sum(durations),
        }
    sets = WorkoutSet.objects.filter(
        workout_exercise__workout__in=workouts,
        workout_exercise__exercise__category__user=user,
        is_completed=True,
    ).select_related("workout_exercise__workout")
    grouped: dict[Any, Any] = {}
    counts: dict[date, int] = defaultdict(int)
    for record in sets:
        exercise = record.workout_exercise
        day = exercise.workout.performed_on
        counts[day] += 1
        key = (
            exercise.exercise_id,
            exercise.exercise_name,
            exercise.tracking_type,
            exercise.weight_unit,
            exercise.distance_unit,
        )
        if key not in grouped:
            grouped[key] = {
                "name": exercise.exercise_name[:120],
                "group": exercise.category_name[:120],
                "tracking_type": exercise.tracking_type,
                "weight_unit": exercise.weight_unit,
                "distance_unit": exercise.distance_unit,
                "current": _set_period(),
                "previous": _set_period(),
            }
        period = grouped[key]["current" if day >= dates[7] else "previous"]
        period["completed_sets"] += 1
        period["logged_dates"] = sorted(set(period["logged_dates"]) | {day.isoformat()})
        for field in ("reps", "distance", "duration_seconds"):
            value = getattr(record, field)
            if value is not None:
                period[field] = round((period[field] or 0) + float(value), 3)
        if record.weight is not None:
            period["max_recorded_load"] = max(
                period["max_recorded_load"] or 0, float(record.weight)
            )
        if (
            exercise.tracking_type == "strength"
            and record.weight is not None
            and record.reps is not None
        ):
            period["load_volume"] = round(
                (period["load_volume"] or 0) + float(record.weight) * record.reps, 3
            )
    ordered = sorted(
        grouped.values(),
        key=lambda row: (
            -row["current"]["completed_sets"],
            -row["previous"]["completed_sets"],
            row["name"],
            row["weight_unit"],
        ),
    )
    last = (
        Workout.objects.filter(user=user, performed_on__lte=dates[-1])
        .order_by("-performed_on")
        .values_list("performed_on", flat=True)
        .first()
    )
    last_set = (
        WorkoutSet.objects.filter(
            workout_exercise__workout__user=user,
            workout_exercise__exercise__category__user=user,
            workout_exercise__workout__performed_on__lte=dates[-1],
            is_completed=True,
        )
        .order_by("-workout_exercise__workout__performed_on")
        .values_list("workout_exercise__workout__performed_on", flat=True)
        .first()
    )
    return {
        "sessions": sessions,
        "last_completed_set_on": last_set.isoformat() if last_set else None,
        "details": ordered[:DETAIL_LIMIT],
        "counts": dict(counts),
        "coverage": {
            "last_logged_on": last.isoformat() if last else None,
            "omitted_items": max(0, len(ordered) - DETAIL_LIMIT),
        },
    }


def _set_period() -> dict[str, Any]:
    return {
        "completed_sets": 0,
        "logged_dates": [],
        "reps": None,
        "distance": None,
        "duration_seconds": None,
        "max_recorded_load": None,
        "load_volume": None,
    }
