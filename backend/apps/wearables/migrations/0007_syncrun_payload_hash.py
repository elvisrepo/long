from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("wearables", "0006_syncrun"),
    ]

    operations = [
        migrations.AddField(
            model_name="syncrun",
            name="payload_hash",
            field=models.CharField(blank=True, default="", max_length=64),
        ),
    ]
