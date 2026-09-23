from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("wearables", "0002_health_connect_only"),
    ]

    operations = [
        migrations.AddConstraint(
            model_name="wearableconnection",
            constraint=models.UniqueConstraint(
                fields=("user", "provider"),
                name="wear_conn_unique_user_provider",
            ),
        ),
    ]
