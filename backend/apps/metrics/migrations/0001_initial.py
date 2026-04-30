import uuid

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models
from django.db.models import Q


DEFAULT_METRIC_DEFINITIONS = [
    # Seed rows, not model constants: these must exist in the database for API reads.
    {
        "name": "Resting Heart Rate",
        "slug": "resting_hr",
        "unit": "bpm",
        "category": "cardiovascular",
        "min_value": 20,
        "max_value": 220,
    },
    {
        "name": "VO2 Max",
        "slug": "vo2_max",
        "unit": "ml/kg/min",
        "category": "respiratory",
        "min_value": 10,
        "max_value": 100,
    },
    {
        "name": "Heart Rate Variability",
        "slug": "hrv",
        "unit": "ms",
        "category": "recovery",
        "min_value": 1,
        "max_value": 300,
    },
    {
        "name": "Body Weight",
        "slug": "body_weight",
        "unit": "kg",
        "category": "body_composition",
        "min_value": 20,
        "max_value": 400,
    },
    {
        "name": "Sleep Duration",
        "slug": "sleep_duration",
        "unit": "hours",
        "category": "recovery",
        "min_value": 0,
        "max_value": 24,
    },
]


def seed_default_metric_definitions(
    apps: object,
    schema_editor: object,
) -> None:
    # Use the historical model from the migration registry, not the live model import,  because
    # migrations must use the historical model state at that migration point.
    MetricDefinition = apps.get_model("metrics", "MetricDefinition")

    for definition in DEFAULT_METRIC_DEFINITIONS:
        # Idempotent so re-running against a partially seeded DB repairs values.
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


def remove_default_metric_definitions(
    apps: object,
    schema_editor: object,
) -> None:
    # Reverse migration removes only the system defaults created here.
    MetricDefinition = apps.get_model("metrics", "MetricDefinition")
    MetricDefinition.objects.filter(
        user=None,
        slug__in=[
            definition["slug"] for definition in DEFAULT_METRIC_DEFINITIONS
        ],
    ).delete()


class Migration(migrations.Migration):
    initial = True

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="MetricDefinition",
            fields=[
                (
                    "id",
                    models.UUIDField(
                        default=uuid.uuid4,
                        editable=False,
                        primary_key=True,
                        serialize=False,
                    ),
                ),
                ("name", models.CharField(max_length=120)),
                ("slug", models.SlugField(max_length=80)),
                ("unit", models.CharField(max_length=32)),
                (
                    "category",
                    models.CharField(
                        choices=[
                            ("cardiovascular", "Cardiovascular"),
                            ("respiratory", "Respiratory"),
                            ("body_composition", "Body Composition"),
                            ("recovery", "Recovery"),
                            ("activity", "Activity"),
                            ("biomarker", "Biomarker"),
                            ("custom", "Custom"),
                        ],
                        max_length=32,
                    ),
                ),
                ("min_value", models.FloatField()),
                ("max_value", models.FloatField()),
                ("is_default", models.BooleanField(default=False)),
                ("is_active", models.BooleanField(default=True)),
                ("metadata", models.JSONField(blank=True, default=dict)),
                (
                    "user",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="metric_definitions",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={
                "db_table": "metrics_metric_definition",
            },
        ),
        migrations.AddConstraint(
            model_name="metricdefinition",
            # System default metric slugs are globally unique.
            constraint=models.UniqueConstraint(
                condition=Q(("user__isnull", True)),
                fields=("slug",),
                name="unique_default_metric_definition_slug",
            ),
        ),
        migrations.AddConstraint(
            model_name="metricdefinition",
            # Custom metric slugs are unique per user, but may repeat across users.
            constraint=models.UniqueConstraint(
                condition=Q(("user__isnull", False)),
                fields=("user", "slug"),
                name="unique_user_metric_definition_slug",
            ),
        ),
        migrations.RunPython(
            seed_default_metric_definitions,
            remove_default_metric_definitions,
        ),
    ]
