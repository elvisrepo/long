from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("users", "0003_user_sleep_target_minutes")]
    operations = [
        migrations.AddField(
            model_name="user",
            name="personal_info_encrypted",
            field=models.TextField(blank=True, default="", editable=False),
        ),
    ]
