from datetime import UTC, date, datetime, timedelta
from typing import TypedDict

from django.contrib.auth.models import AbstractBaseUser
from django.utils import timezone

from apps.metrics.models import MetricEntry


class WeightStepsPoint(TypedDict):
    date: str
    weight_kg: float | None
    weight_7d_average_kg: float | None
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


class SleepInsightsPoint(TypedDict):
    date: str
    duration_minutes: int | None
    period_start: str | None
    recorded_at: str | None
    shortfall_minutes: int | None


class SleepInsightsWorstNight(TypedDict):
    date: str
    duration_minutes: int


class SleepInsightsSummary(TypedDict):
    tracked_nights: int
    nights_under_target: int
    total_shortfall_minutes: int
    average_duration_minutes: int | None
    worst_night: SleepInsightsWorstNight | None


class SleepInsightsAnalytics(TypedDict):
    range_days: int
    target_minutes: int
    series: list[SleepInsightsPoint]
    summary: SleepInsightsSummary


def get_weight_steps_analytics(
    *,
    user: AbstractBaseUser,
    days: int,
) -> WeightStepsAnalytics:
    now = timezone.now()
    today_start = datetime.combine(now.date(), datetime.min.time(), tzinfo=UTC)
    period_start = today_start - timedelta(days=days - 1)
    rolling_period_start = period_start - timedelta(days=6)
    entries = (
        MetricEntry.objects.filter(
            user=user,
            metric_definition__slug__in=("body_weight", "steps"),
            metric_definition__user__isnull=True,
            metric_definition__is_default=True,
            recorded_at__gte=rolling_period_start,
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

    selected_dates = [
        period_start.date() + timedelta(days=day_offset) for day_offset in range(days)
    ]
    series: list[WeightStepsPoint] = []
    for entry_date in selected_dates:
        values = daily_values.get(entry_date, {})
        rolling_weights = [
            daily_values[rolling_date]["weight_kg"]
            for day_offset in range(7)
            if (
                (rolling_date := entry_date - timedelta(days=day_offset))
                in daily_values
                and "weight_kg" in daily_values[rolling_date]
            )
        ]
        series.append(
            {
                "date": entry_date.isoformat(),
                "weight_kg": values.get("weight_kg"),
                "weight_7d_average_kg": (
                    round(sum(rolling_weights) / len(rolling_weights), 2)
                    if rolling_weights
                    else None
                ),
                "steps": round(values["steps"]) if "steps" in values else None,
            }
        )
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


def get_sleep_insights(
    *,
    user: AbstractBaseUser,
    target_minutes: int,
) -> SleepInsightsAnalytics:
    range_days = 7
    now = timezone.now()
    today_start = datetime.combine(now.date(), datetime.min.time(), tzinfo=UTC)
    period_start = today_start - timedelta(days=range_days - 1)
    entries = (
        MetricEntry.objects.filter(
            user=user,
            metric_definition__slug="sleep_duration",
            metric_definition__user__isnull=True,
            metric_definition__is_default=True,
            recorded_at__gte=period_start,
            recorded_at__lte=now,
        )
        .select_related("metric_definition")
        .order_by("recorded_at", "id")
    )

    daily_entries: dict[date, MetricEntry] = {}
    for entry in entries:
        daily_entries[entry.recorded_at.astimezone(UTC).date()] = entry

    series: list[SleepInsightsPoint] = []
    for day_offset in range(range_days):
        entry_date = period_start.date() + timedelta(days=day_offset)
        entry = daily_entries.get(entry_date)
        if entry is None:
            series.append(
                {
                    "date": entry_date.isoformat(),
                    "duration_minutes": None,
                    "period_start": None,
                    "recorded_at": None,
                    "shortfall_minutes": None,
                }
            )
            continue

        duration_minutes = round(entry.value * 60)
        series.append(
            {
                "date": entry_date.isoformat(),
                "duration_minutes": duration_minutes,
                "period_start": (
                    _format_utc_timestamp(entry.period_start)
                    if entry.period_start is not None
                    else None
                ),
                "recorded_at": _format_utc_timestamp(entry.recorded_at),
                "shortfall_minutes": max(target_minutes - duration_minutes, 0),
            }
        )

    tracked_points = [
        point for point in series if point["duration_minutes"] is not None
    ]
    durations = [
        point["duration_minutes"]
        for point in tracked_points
        if point["duration_minutes"] is not None
    ]
    worst_point = (
        min(
            tracked_points,
            key=lambda point: point["duration_minutes"] or 0,
        )
        if tracked_points
        else None
    )

    return {
        "range_days": range_days,
        "target_minutes": target_minutes,
        "series": series,
        "summary": {
            "tracked_nights": len(tracked_points),
            "nights_under_target": sum(
                duration < target_minutes for duration in durations
            ),
            "total_shortfall_minutes": sum(
                max(target_minutes - duration, 0) for duration in durations
            ),
            "average_duration_minutes": (
                round(sum(durations) / len(durations)) if durations else None
            ),
            "worst_night": (
                {
                    "date": worst_point["date"],
                    "duration_minutes": worst_point["duration_minutes"] or 0,
                }
                if worst_point is not None
                else None
            ),
        },
    }


def _format_utc_timestamp(value: datetime) -> str:
    return value.astimezone(UTC).isoformat().replace("+00:00", "Z")
