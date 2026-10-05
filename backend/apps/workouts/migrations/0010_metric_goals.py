from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("workouts", "0009_workout_timing")]
    operations = [
        migrations.RemoveConstraint(
            model_name="exercisegoal", name="valid_exercise_goal_target"
        ),
        migrations.AlterField(
            model_name="exercisegoal",
            name="target_weight",
            field=models.DecimalField(
                max_digits=8, decimal_places=3, null=True, blank=True
            ),
        ),
        migrations.AlterField(
            model_name="exercisegoal",
            name="target_reps",
            field=models.PositiveIntegerField(null=True, blank=True),
        ),
        migrations.AddField(
            model_name="exercisegoal",
            name="goal_type",
            field=models.CharField(
                max_length=16,
                default="strength",
                choices=[
                    (kind, kind)
                    for kind in [
                        "strength",
                        "reps",
                        "distance",
                        "duration",
                        "max_speed",
                        "best_pace",
                    ]
                ],
            ),
        ),
        migrations.AddField(
            model_name="exercisegoal",
            name="tracking_type",
            field=models.CharField(
                max_length=12,
                default="strength",
                choices=[
                    ("strength", "Weight and reps"),
                    ("bodyweight", "Reps with optional load"),
                    ("duration", "Duration"),
                    ("cardio", "Distance and duration"),
                ],
            ),
        ),
        migrations.AddField(
            model_name="exercisegoal",
            name="target_value",
            field=models.DecimalField(
                max_digits=12, decimal_places=3, null=True, blank=True
            ),
        ),
        migrations.AddConstraint(
            model_name="exercisegoal",
            constraint=models.CheckConstraint(
                condition=(
                    models.Q(
                        goal_type="strength",
                        tracking_type="strength",
                        target_value__isnull=True,
                        target_weight__isnull=False,
                        target_reps__isnull=False,
                    )
                    & models.Q(
                        target_weight__gt=0,
                        target_weight__lte=10000,
                        target_reps__gte=1,
                        target_reps__lte=10000,
                    )
                )
                | (
                    models.Q(
                        target_weight__isnull=True,
                        target_reps__isnull=True,
                        target_value__isnull=False,
                        target_value__gt=0,
                    )
                    & (
                        models.Q(
                            goal_type="reps",
                            tracking_type="bodyweight",
                            target_value__gte=1,
                            target_value__lte=100000,
                        )
                        | models.Q(
                            goal_type="duration",
                            tracking_type__in=["cardio", "duration"],
                            target_value__gte=1,
                            target_value__lte=604800,
                        )
                        | models.Q(
                            goal_type__in=["distance", "max_speed", "best_pace"],
                            tracking_type="cardio",
                            target_value__lte=100000,
                        )
                    )
                ),
                name="valid_exercise_goal_target",
            ),
        ),
    ]
