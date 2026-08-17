from django.apps.registry import Apps
from django.db import migrations
from django.db.backends.base.schema import BaseDatabaseSchemaEditor


STEPS_SLUG = "steps"


def add_steps_default_metric(
    apps: Apps,
    schema_editor: BaseDatabaseSchemaEditor,
) -> None:
    """Add Steps to databases that already ran the initial metric seed."""
    MetricDefinition = apps.get_model("metrics", "MetricDefinition")
    MetricDefinition.objects.update_or_create(
        user=None,
        slug=STEPS_SLUG,
        defaults={
            "name": "Steps",
            "unit": "steps",
            "category": "activity",
            "min_value": 0,
            "max_value": 200_000,
            "is_default": True,
            "is_active": True,
            "metadata": {},
        },
    )


def remove_steps_default_metric(
    apps: Apps,
    schema_editor: BaseDatabaseSchemaEditor,
) -> None:
    """Remove only the system-owned Steps definition created by this migration."""
    MetricDefinition = apps.get_model("metrics", "MetricDefinition")
    MetricDefinition.objects.filter(user=None, slug=STEPS_SLUG).delete()


class Migration(migrations.Migration):
    dependencies = [
        ("metrics", "0004_metricentry_external_record_uniqueness"),
    ]

    operations = [
        migrations.RunPython(
            add_steps_default_metric,
            remove_steps_default_metric,
        ),
    ]
