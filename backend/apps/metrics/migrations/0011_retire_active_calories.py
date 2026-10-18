from django.apps.registry import Apps
from django.db import migrations
from django.db.backends.base.schema import BaseDatabaseSchemaEditor


def retire_active_calories(apps: Apps, schema_editor: BaseDatabaseSchemaEditor) -> None:
    definition = apps.get_model("metrics", "MetricDefinition")
    definition.objects.filter(user=None, slug="active_calories_burned").update(is_active=False)


def restore_active_calories(apps: Apps, schema_editor: BaseDatabaseSchemaEditor) -> None:
    definition = apps.get_model("metrics", "MetricDefinition")
    definition.objects.filter(user=None, slug="active_calories_burned").update(is_active=True)


class Migration(migrations.Migration):
    dependencies = [("metrics", "0010_total_calories_burned")]
    operations = [migrations.RunPython(retire_active_calories, restore_active_calories)]
