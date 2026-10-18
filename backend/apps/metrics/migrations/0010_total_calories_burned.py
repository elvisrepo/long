from django.apps.registry import Apps
from django.db import migrations
from django.db.backends.base.schema import BaseDatabaseSchemaEditor


def add_total_calories(apps: Apps, schema_editor: BaseDatabaseSchemaEditor) -> None:
    definition = apps.get_model("metrics", "MetricDefinition")
    definition.objects.update_or_create(
        user=None,
        slug="total_calories_burned",
        defaults={
            "name": "Total Calories Burned",
            "unit": "kcal",
            "category": "activity",
            "min_value": 0,
            "max_value": 1_000_000,
            "is_default": True,
            "is_active": True,
            "metadata": {},
        },
    )


class Migration(migrations.Migration):
    dependencies = [("metrics", "0009_health_connect_source")]
    operations = [migrations.RunPython(add_total_calories, migrations.RunPython.noop)]
