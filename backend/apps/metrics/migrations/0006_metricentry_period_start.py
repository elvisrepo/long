from django.db import migrations, models
from django.db.models import F, Q


class Migration(migrations.Migration):
    dependencies = [
        ("metrics", "0005_add_steps_default_metric"),
    ]

    operations = [
        migrations.AddField(
            model_name="metricentry",
            name="period_start",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddConstraint(
            model_name="metricentry",
            constraint=models.CheckConstraint(
                condition=(
                    Q(period_start__isnull=True)
                    | Q(period_start__lt=F("recorded_at"))
                ),
                name="metrics_valid_entry_period",
            ),
        ),
    ]
