import uuid
import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("workouts", "0007_workout_preferences")]
    operations = [
        migrations.CreateModel(
            name="ExerciseGoal",
            fields=[
                (
                    "id",
                    models.UUIDField(
                        default=uuid.uuid4,
                        editable=False,
                        primary_key=True,
                        serialize=False,
                    ),
                ),
                ("target_weight", models.DecimalField(decimal_places=3, max_digits=8)),
                ("target_reps", models.PositiveIntegerField()),
                (
                    "weight_unit",
                    models.CharField(
                        choices=[("kg", "kg"), ("lb", "lb")], max_length=3
                    ),
                ),
                (
                    "distance_unit",
                    models.CharField(
                        choices=[("km", "km"), ("mi", "mi")], max_length=3
                    ),
                ),
                (
                    "rep_rule",
                    models.CharField(
                        choices=[("at_least", "At least"), ("exact", "Exactly")],
                        default="at_least",
                        max_length=8,
                    ),
                ),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                (
                    "exercise",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="goals",
                        to="workouts.exercise",
                    ),
                ),
            ],
            options={
                "ordering": ["created_at", "id"],
                "constraints": [
                    models.CheckConstraint(
                        condition=models.Q(
                            target_weight__gt=0,
                            target_weight__lte=10000,
                            target_reps__gte=1,
                            target_reps__lte=10000,
                        ),
                        name="valid_exercise_goal_target",
                    )
                ],
            },
        )
    ]
