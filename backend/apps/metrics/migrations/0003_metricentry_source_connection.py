import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("metrics", "0002_metricentry"),
        ("wearables", "0006_syncrun"),
    ]

    operations = [
        migrations.RenameField(
            model_name="metricentry",
            old_name="source_connection_id",
            new_name="source_connection",
        ),
        migrations.AlterField(
            model_name="metricentry",
            name="source_connection",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.RESTRICT,
                related_name="metric_entries",
                to="wearables.wearableconnection",
            ),
        ),
    ]
