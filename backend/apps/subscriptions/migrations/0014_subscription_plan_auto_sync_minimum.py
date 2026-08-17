from django.db import migrations, models
from django.db.models import Q


class Migration(migrations.Migration):
    dependencies = [
        ("subscriptions", "0013_subscription_plan_sync_policy"),
    ]

    operations = [
        migrations.AddConstraint(
            model_name="subscriptionplan",
            constraint=models.CheckConstraint(
                condition=(
                    Q(automatic_sync_enabled=False)
                    | Q(sync_interval_minutes__gte=15)
                ),
                name="subscription_plan_auto_sync_min_15",
            ),
        ),
    ]
