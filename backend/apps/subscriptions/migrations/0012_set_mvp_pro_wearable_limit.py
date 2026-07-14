from django.apps.registry import Apps
from django.db import migrations
from django.db.backends.base.schema import BaseDatabaseSchemaEditor


def set_mvp_pro_wearable_limit(
    apps: Apps,
    schema_editor: BaseDatabaseSchemaEditor,
) -> None:
    subscription_plan = apps.get_model("subscriptions", "SubscriptionPlan")
    subscription_plan.objects.filter(code="pro").update(
        wearable_connection_limit=1,
    )


def restore_previous_pro_wearable_limit(
    apps: Apps,
    schema_editor: BaseDatabaseSchemaEditor,
) -> None:
    subscription_plan = apps.get_model("subscriptions", "SubscriptionPlan")
    subscription_plan.objects.filter(code="pro").update(
        wearable_connection_limit=2,
    )


class Migration(migrations.Migration):
    dependencies = [
        ("subscriptions", "0011_subscription_cancel_at"),
    ]

    operations = [
        migrations.RunPython(
            set_mvp_pro_wearable_limit,
            restore_previous_pro_wearable_limit,
        ),
    ]
