from django.apps.registry import Apps
from django.db import migrations, models
from django.db.backends.base.schema import BaseDatabaseSchemaEditor


def configure_sync_policies(
    apps: Apps,
    schema_editor: BaseDatabaseSchemaEditor,
) -> None:
    subscription_plan = apps.get_model("subscriptions", "SubscriptionPlan")
    subscription_plan.objects.filter(code="free").update(
        wearable_connection_limit=1,
        automatic_sync_enabled=False,
        sync_interval_minutes=30,
    )
    subscription_plan.objects.filter(code="pro").update(
        automatic_sync_enabled=True,
        sync_interval_minutes=15,
    )


def restore_previous_sync_policies(
    apps: Apps,
    schema_editor: BaseDatabaseSchemaEditor,
) -> None:
    subscription_plan = apps.get_model("subscriptions", "SubscriptionPlan")
    subscription_plan.objects.filter(code="free").update(
        wearable_connection_limit=0,
        automatic_sync_enabled=False,
        sync_interval_minutes=60,
    )
    subscription_plan.objects.filter(code="pro").update(
        automatic_sync_enabled=False,
        sync_interval_minutes=15,
    )


class Migration(migrations.Migration):
    dependencies = [
        ("subscriptions", "0012_set_mvp_pro_wearable_limit"),
    ]

    operations = [
        migrations.AddField(
            model_name="subscriptionplan",
            name="automatic_sync_enabled",
            field=models.BooleanField(default=False),
        ),
        migrations.RunPython(
            configure_sync_policies,
            restore_previous_sync_policies,
        ),
    ]
