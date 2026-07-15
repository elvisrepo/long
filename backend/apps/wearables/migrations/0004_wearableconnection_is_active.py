from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("wearables", "0003_unique_provider_per_user"),
    ]

    operations = [
        migrations.AddField(
            model_name="wearableconnection",
            name="is_active",
            field=models.BooleanField(default=True),
        ),
    ]
