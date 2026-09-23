from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("users", "0002_alter_user_email"),
    ]

    operations = [
        migrations.AddField(
            model_name="user",
            name="sleep_target_minutes",
            field=models.PositiveSmallIntegerField(
                default=450,
                validators=[MinValueValidator(60), MaxValueValidator(1439)],
            ),
        ),
    ]
