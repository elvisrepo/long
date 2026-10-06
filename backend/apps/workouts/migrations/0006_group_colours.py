from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("workouts", "0005_exercise_groups")]
    operations = [
        migrations.AddField(
            model_name="workoutexercise",
            name="group_colour",
            field=models.CharField(default="#007f68", max_length=7),
        ),
        migrations.AddField(
            model_name="routineexercise",
            name="group_colour",
            field=models.CharField(default="#007f68", max_length=7),
        ),
    ]
