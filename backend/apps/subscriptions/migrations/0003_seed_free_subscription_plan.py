from django.db import migrations


def seed_free_subscription_plan(apps: object, schema_editor: object) -> None:
    # Migrations use the model state at this point in history, not the current
    # model class, so future model changes cannot break old migrations.
    SubscriptionPlan = apps.get_model("subscriptions", "SubscriptionPlan") # django app lable, model name inside that app.

    # Keep the seed idempotent and repair the canonical values if the row
    # already exists in a partially migrated environment.
    SubscriptionPlan.objects.update_or_create(
        code="free",
        defaults={
            "name": "Free",
            "active_custom_metric_limit": 3,
            "wearable_connection_limit": 0,
            "sync_interval_minutes": 60,
            "analytics_enabled": False,
            "csv_import_enabled": False,
            "is_default": True,
            "is_active": True,
        },
    )


def remove_free_subscription_plan(apps: object, schema_editor: object) -> None:
    # This reverse operation allows migrating back before this seed safely.
    SubscriptionPlan = apps.get_model("subscriptions", "SubscriptionPlan")
    SubscriptionPlan.objects.filter(code="free").delete()


class Migration(migrations.Migration):
    # The table must exist before this migration can insert its seed row.
    dependencies = [
        ("subscriptions", "0002_subscription"),
    ]

    operations = [
        migrations.RunPython(
            seed_free_subscription_plan,
            remove_free_subscription_plan,
        ),
    ]


'''
 0003_seed_free_subscription_plan.py is a data migration. Unlike migrations 0001 and 0002, it
  does not create a table. It inserts required application data into an existing table.
'''