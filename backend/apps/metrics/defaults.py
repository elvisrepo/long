from apps.metrics.models import MetricDefinition


DEFAULT_METRIC_DEFINITIONS = [
    {
        "name": "Resting Heart Rate",
        "slug": "resting_hr",
        "unit": "bpm",
        "category": MetricDefinition.Category.CARDIOVASCULAR,
        "min_value": 20,
        "max_value": 220,
    },
    {
        "name": "VO2 Max",
        "slug": "vo2_max",
        "unit": "ml/kg/min",
        "category": MetricDefinition.Category.RESPIRATORY,
        "min_value": 10,
        "max_value": 100,
    },
    {
        "name": "Heart Rate Variability",
        "slug": "hrv",
        "unit": "ms",
        "category": MetricDefinition.Category.RECOVERY,
        "min_value": 1,
        "max_value": 300,
    },
    {
        "name": "Body Weight",
        "slug": "body_weight",
        "unit": "kg",
        "category": MetricDefinition.Category.BODY_COMPOSITION,
        "min_value": 20,
        "max_value": 400,
    },
    {
        "name": "Sleep Duration",
        "slug": "sleep_duration",
        "unit": "hours",
        "category": MetricDefinition.Category.RECOVERY,
        "min_value": 0,
        "max_value": 24,
    },
    {
        "name": "Steps",
        "slug": "steps",
        "unit": "steps",
        "category": MetricDefinition.Category.ACTIVITY,
        "min_value": 0,
        "max_value": 200_000,
    },
]


def seed_default_metric_definitions() -> None:
    """Ensure system metric definitions exist in the active runtime database."""
    for definition in DEFAULT_METRIC_DEFINITIONS:
        MetricDefinition.objects.update_or_create(
            user=None,
            slug=definition["slug"],
            defaults={
                **definition,
                "is_default": True,
                "is_active": True,
                "metadata": {},
            },
        )
