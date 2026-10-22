from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("workouts", "0011_combined_cardio_goals")]
    operations = [
        migrations.AddField(
            model_name="workout",
            name="workout_started_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="workout",
            name="workout_ended_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
    ]
