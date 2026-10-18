from django.apps.registry import Apps
from django.db import migrations
from django.db.backends.base.schema import BaseDatabaseSchemaEditor


def add_vitals(apps: Apps, schema_editor: BaseDatabaseSchemaEditor) -> None:
    definition = apps.get_model("metrics", "MetricDefinition")
    for slug, name, unit, category, minimum, maximum in [
        ("respiratory_rate", "Respiratory Rate", "breaths/min", "respiratory", 0, 1000),
        ("skin_temperature", "Skin Temperature Change", "°C", "biomarker", -30, 30),
    ]:
        definition.objects.update_or_create(
            user=None,
            slug=slug,
            defaults={
                "name": name,
                "unit": unit,
                "category": category,
                "min_value": minimum,
                "max_value": maximum,
                "is_default": True,
                "is_active": True,
                "metadata": {},
            },
        )


class Migration(migrations.Migration):
    dependencies = [("metrics", "0011_retire_active_calories")]
    operations = [migrations.RunPython(add_vitals, migrations.RunPython.noop)]
