from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("users", "0004_user_personal_info_encrypted")]
    operations = [
        migrations.AddField(
            model_name="user",
            name="ai_api_key_encrypted",
            field=models.TextField(default="", blank=True, editable=False),
        ),
    ]
