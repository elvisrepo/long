from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("wearables", "0004_wearableconnection_is_active"),
    ]

    operations = [
        migrations.AlterField(
            model_name="wearableconnection",
            name="status",
            field=models.CharField(
                choices=[
                    ("pending", "Pending"),
                    ("connected", "Connected"),
                    ("disconnected", "Disconnected"),
                    ("error", "Error"),
                ],
                default="pending",
                max_length=32,
            ),
        ),
    ]
