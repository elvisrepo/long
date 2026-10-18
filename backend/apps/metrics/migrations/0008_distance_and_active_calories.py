from django.apps.registry import Apps
from django.db import migrations
from django.db.backends.base.schema import BaseDatabaseSchemaEditor


def add_activity_metrics(
    apps: Apps,
    schema_editor: BaseDatabaseSchemaEditor,
) -> None:
    definition = apps.get_model("metrics", "MetricDefinition")
    for slug, name, unit in (
        ("distance", "Distance", "km"),
        ("active_calories_burned", "Active Calories Burned", "kcal"),
    ):
        definition.objects.update_or_create(
            user=None,
            slug=slug,
            defaults={
                "name": name,
                "unit": unit,
                "category": "activity",
                "min_value": 0,
                "max_value": 1_000_000,
                "is_default": True,
                "is_active": True,
                "metadata": {},
            },
        )


class Migration(migrations.Migration):
    dependencies = [("metrics", "0007_metricentry_source_record_modified_at")]

    operations = [
        # Keep definitions on reversal: historical entries protect their identity.
        migrations.RunPython(add_activity_metrics, migrations.RunPython.noop),
    ]
