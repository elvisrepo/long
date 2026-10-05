from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("workouts", "0010_metric_goals")]
    operations = [
        migrations.RemoveConstraint(
            model_name="exercisegoal", name="valid_exercise_goal_target"
        ),
        migrations.AddField(
            model_name="exercisegoal",
            name="target_distance",
            field=models.DecimalField(
                max_digits=12, decimal_places=3, null=True, blank=True
            ),
        ),
        migrations.AddField(
            model_name="exercisegoal",
            name="target_duration_seconds",
            field=models.PositiveIntegerField(null=True, blank=True),
        ),
        migrations.AlterField(
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
                        "distance_time",
                    ]
                ],
            ),
        ),
        migrations.AddConstraint(
            model_name="exercisegoal",
            constraint=models.CheckConstraint(
                condition=(
                    (
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
                    )
                )
                & models.Q(
                    target_distance__isnull=True, target_duration_seconds__isnull=True
                )
                | models.Q(
                    goal_type="distance_time",
                    tracking_type="cardio",
                    target_weight__isnull=True,
                    target_reps__isnull=True,
                    target_value__isnull=True,
                    target_distance__isnull=False,
                    target_distance__gt=0,
                    target_distance__lte=100000,
                    target_duration_seconds__isnull=False,
                    target_duration_seconds__gte=1,
                    target_duration_seconds__lte=604800,
                ),
                name="valid_exercise_goal_target",
            ),
        ),
    ]
