from django.apps.registry import Apps
from django.db import migrations, models
from django.db.backends.base.schema import BaseDatabaseSchemaEditor


def enable_pro_csv_export(
    apps: Apps,
    schema_editor: BaseDatabaseSchemaEditor,
) -> None:
    subscription_plan = apps.get_model("subscriptions", "SubscriptionPlan")
    subscription_plan.objects.filter(code="pro").update(csv_export_enabled=True)


def disable_pro_csv_export(
    apps: Apps,
    schema_editor: BaseDatabaseSchemaEditor,
) -> None:
    subscription_plan = apps.get_model("subscriptions", "SubscriptionPlan")
    subscription_plan.objects.filter(code="pro").update(csv_export_enabled=False)


class Migration(migrations.Migration):
    dependencies = [
        ("subscriptions", "0014_subscription_plan_auto_sync_minimum"),
    ]

    operations = [
        migrations.AddField(
            model_name="subscriptionplan",
            name="csv_export_enabled",
            field=models.BooleanField(default=False),
        ),
        migrations.RunPython(enable_pro_csv_export, disable_pro_csv_export),
    ]
