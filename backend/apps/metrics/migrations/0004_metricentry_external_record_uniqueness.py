from django.db import migrations, models
from django.db.models import Q


class Migration(migrations.Migration):
    dependencies = [
        ("metrics", "0003_metricentry_source_connection"),
    ]

    operations = [
        migrations.AddConstraint(
            model_name="metricentry",
            constraint=models.UniqueConstraint(
                condition=Q(external_source_id__isnull=False),
                fields=("source_connection", "external_source_id"),
                name="metrics_unique_source_record",
            ),
        ),
    ]
