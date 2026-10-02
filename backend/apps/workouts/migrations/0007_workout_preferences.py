import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models
import apps.workouts.models


class Migration(migrations.Migration):
    dependencies = [
        ("workouts", "0006_group_colours"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]
    operations = [
        migrations.AddField(
            model_name="exercise",
            name="is_favorite",
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name="exercise",
            name="default_graph",
            field=models.CharField(blank=True, max_length=24),
        ),
        migrations.CreateModel(
            name="WorkoutPreferences",
            fields=[
                (
                    "user",
                    models.OneToOneField(
                        on_delete=django.db.models.deletion.CASCADE,
                        primary_key=True,
                        serialize=False,
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
                ("auto_start_rest", models.BooleanField(default=False)),
                ("auto_advance_groups", models.BooleanField(default=True)),
                (
                    "bar_kg",
                    models.DecimalField(decimal_places=3, default="20", max_digits=7),
                ),
                (
                    "bar_lb",
                    models.DecimalField(decimal_places=3, default="45", max_digits=7),
                ),
                (
                    "plates_kg",
                    models.JSONField(default=apps.workouts.models.metric_plates),
                ),
                (
                    "plates_lb",
                    models.JSONField(default=apps.workouts.models.imperial_plates),
                ),
            ],
        ),
    ]
