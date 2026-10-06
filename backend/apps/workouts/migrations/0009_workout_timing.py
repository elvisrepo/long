from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("workouts", "0008_exercise_goals")]
    operations = [
        migrations.AddField(
            model_name="workout",
            name="duration_seconds",
            field=models.PositiveIntegerField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="workout",
            name="timer_started_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddConstraint(
            model_name="workout",
            constraint=models.CheckConstraint(
                condition=models.Q(duration_seconds__isnull=True)
                | models.Q(duration_seconds__lte=604800),
                name="workout_duration_bound",
            ),
        ),
        migrations.AddConstraint(
            model_name="workout",
            constraint=models.CheckConstraint(
                condition=models.Q(timer_started_at__isnull=True)
                | (
                    models.Q(is_finished=False)
                    & models.Q(duration_seconds__isnull=False)
                ),
                name="workout_timer_state",
            ),
        ),
    ]
