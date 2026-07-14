from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("wearables", "0001_initial"),
    ]

    operations = [
        migrations.AlterField(
            model_name="wearableconnection",
            name="provider",
            field=models.CharField(
                choices=[("health_connect", "Health Connect")],
                max_length=32,
            ),
        ),
    ]
