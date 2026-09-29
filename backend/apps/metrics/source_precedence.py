from collections.abc import Iterable

from apps.metrics.models import MetricEntry


DAILY_SOURCE_PRECEDENCE: tuple[str, ...] = (
    str(MetricEntry.Source.FITBIT),
    str(MetricEntry.Source.SAMSUNG_HEALTH),
    str(MetricEntry.Source.MANUAL),
    str(MetricEntry.Source.CSV_IMPORT),
    str(MetricEntry.Source.GARMIN),
    str(MetricEntry.Source.OURA),
    str(MetricEntry.Source.WITHINGS),
)
SOURCE_PRIORITY: dict[str, int] = {
    source: priority for priority, source in enumerate(DAILY_SOURCE_PRECEDENCE)
}


def preferred_metric_source(sources: Iterable[str]) -> str:
    """Choose one truthful source so overlapping providers are not combined."""

    return min(
        sources,
        key=lambda source: SOURCE_PRIORITY.get(
            source,
            len(DAILY_SOURCE_PRECEDENCE),
        ),
    )
