from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("workouts", "0004_routines")]
    operations = [
        migrations.AddField(
            model_name="workoutexercise",
            name="group_name",
            field=models.CharField(blank=True, max_length=120),
        ),
        migrations.AddField(
            model_name="routineexercise",
            name="group_name",
            field=models.CharField(blank=True, max_length=120),
        ),
    ]
