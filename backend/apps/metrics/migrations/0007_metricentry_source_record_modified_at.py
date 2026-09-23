from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("metrics", "0006_metricentry_period_start"),
    ]

    operations = [
        migrations.AddField(
            model_name="metricentry",
            name="source_record_modified_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
    ]
