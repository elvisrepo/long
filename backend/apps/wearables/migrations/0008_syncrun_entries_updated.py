from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("wearables", "0007_syncrun_payload_hash"),
    ]

    operations = [
        migrations.AddField(
            model_name="syncrun",
            name="entries_updated",
            field=models.PositiveIntegerField(default=0),
        ),
    ]
