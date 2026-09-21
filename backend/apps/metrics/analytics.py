from datetime import UTC, date, datetime, timedelta
from typing import TypedDict

from django.contrib.auth.models import AbstractBaseUser
from django.utils import timezone

from apps.metrics.models import MetricEntry


class WeightStepsPoint(TypedDict):
    date: str
    weight_kg: float | None
    steps: int | None


class WeightStepsSummary(TypedDict):
    weight_start_kg: float | None
    weight_end_kg: float | None
    weight_change_kg: float | None
    average_daily_steps: int | None


class WeightStepsAnalytics(TypedDict):
    range_days: int
    series: list[WeightStepsPoint]
    summary: WeightStepsSummary


def get_weight_steps_analytics(
    *,
    user: AbstractBaseUser,
    days: int,
) -> WeightStepsAnalytics:
    now = timezone.now()
    today_start = datetime.combine(now.date(), datetime.min.time(), tzinfo=UTC)
    period_start = today_start - timedelta(days=days - 1)
    entries = (
        MetricEntry.objects.filter(
            user=user,
            metric_definition__slug__in=("body_weight", "steps"),
            metric_definition__user__isnull=True,
            metric_definition__is_default=True,
            recorded_at__gte=period_start,
            recorded_at__lte=now,
        )
        .select_related("metric_definition")
        .order_by("recorded_at", "id")
    )

    daily_values: dict[date, dict[str, float]] = {}
    for entry in entries:
        entry_date = entry.recorded_at.astimezone(UTC).date()
        values = daily_values.setdefault(entry_date, {})
        if entry.metric_definition.slug == "body_weight":
            values["weight_kg"] = entry.value
        else:
            values["steps"] = values.get("steps", 0) + entry.value

    series: list[WeightStepsPoint] = [
        {
            "date": entry_date.isoformat(),
            "weight_kg": values.get("weight_kg"),
            "steps": (round(values["steps"]) if "steps" in values else None),
        }
        for entry_date, values in sorted(daily_values.items())
    ]
    weights = [point["weight_kg"] for point in series if point["weight_kg"] is not None]
    daily_steps = [point["steps"] for point in series if point["steps"] is not None]
    weight_start = weights[0] if weights else None
    weight_end = weights[-1] if weights else None

    return {
        "range_days": days,
        "series": series,
        "summary": {
            "weight_start_kg": weight_start,
            "weight_end_kg": weight_end,
            "weight_change_kg": (
                round(weight_end - weight_start, 2)
                if weight_start is not None and weight_end is not None
                else None
            ),
            "average_daily_steps": (
                round(sum(daily_steps) / len(daily_steps)) if daily_steps else None
            ),
        },
    }
