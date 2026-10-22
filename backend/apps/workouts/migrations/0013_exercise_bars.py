from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("workouts", "0012_workout_timestamps")]
    operations = [
        migrations.AddField(
            model_name="workoutpreferences",
            name="exercise_bars",
            field=models.JSONField(default=list),
        ),
    ]
