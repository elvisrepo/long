import uuid
from datetime import datetime
from django.utils import timezone
from decimal import Decimal

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models
from django.db.models.functions import Lower


class TrackingType(models.TextChoices):
    STRENGTH = "strength", "Weight and reps"
    BODYWEIGHT = "bodyweight", "Reps with optional load"
    DURATION = "duration", "Duration"
    CARDIO = "cardio", "Distance and duration"


def validate_quantities(
    tracking_type: str, values: dict[str, Decimal | int | None], completed: bool
) -> None:
    allowed = {
        str(TrackingType.STRENGTH): {"weight", "reps"},
        str(TrackingType.BODYWEIGHT): {"weight", "reps"},
        str(TrackingType.DURATION): {"duration_seconds"},
        str(TrackingType.CARDIO): {"distance", "duration_seconds"},
    }[tracking_type]
    required = allowed - (
        {"weight"} if tracking_type == TrackingType.BODYWEIGHT else set()
    )
    errors = {}
    for field, value in values.items():
        if value is not None and field not in allowed:
            errors[field] = "This field is not used by this exercise type."
        elif value is not None and (value < 0 or (field != "weight" and value == 0)):
            errors[field] = "Enter a valid nonnegative load or positive quantity."
        elif completed and field in required and value is None:
            errors[field] = "Required for a completed set."
    if errors:
        raise ValidationError(errors)


class WorkoutCatalogState(models.Model):
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL, primary_key=True, on_delete=models.CASCADE
    )
    initialized_at = models.DateTimeField(auto_now_add=True)


def metric_plates() -> list[dict[str, str | int]]:
    return [
        {"weight": weight, "count": 0}
        for weight in ("25", "20", "15", "10", "5", "2.5", "1.25")
    ]


def imperial_plates() -> list[dict[str, str | int]]:
    return [
        {"weight": weight, "count": 0}
        for weight in ("45", "35", "25", "10", "5", "2.5")
    ]


class WorkoutPreferences(models.Model):
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL, primary_key=True, on_delete=models.CASCADE
    )
    auto_start_rest = models.BooleanField(default=False)
    auto_advance_groups = models.BooleanField(default=True)
    bar_kg = models.DecimalField(max_digits=7, decimal_places=3, default="20")
    bar_lb = models.DecimalField(max_digits=7, decimal_places=3, default="45")
    plates_kg = models.JSONField(default=metric_plates)
    plates_lb = models.JSONField(default=imperial_plates)


class ExerciseCategory(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="exercise_categories",
    )
    name = models.CharField(max_length=120)
    display_order = models.PositiveIntegerField(default=100)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["display_order", "name", "id"]
        constraints = [
            models.UniqueConstraint(
                Lower("name"), "user", name="unique_exercise_category_name"
            )
        ]


class Exercise(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    category = models.ForeignKey(
        ExerciseCategory, on_delete=models.CASCADE, related_name="exercises"
    )
    name = models.CharField(max_length=120)
    tracking_type = models.CharField(max_length=16, choices=TrackingType.choices)
    weight_unit = models.CharField(
        max_length=3, choices=[("kg", "kg"), ("lb", "lb")], default="kg"
    )
    distance_unit = models.CharField(
        max_length=3, choices=[("km", "km"), ("mi", "mi")], default="km"
    )
    notes = models.TextField(max_length=2000, blank=True)
    weight_increment = models.DecimalField(
        max_digits=7, decimal_places=3, default="2.5"
    )
    rest_seconds = models.PositiveIntegerField(default=90)
    display_order = models.PositiveIntegerField(default=100)
    is_active = models.BooleanField(default=True)
    is_favorite = models.BooleanField(default=False)
    default_graph = models.CharField(max_length=24, blank=True)

    class Meta:
        ordering = ["display_order", "name", "id"]
        constraints = [
            models.UniqueConstraint(
                Lower("name"), "category", name="unique_exercise_name"
            )
        ]


class ExerciseGoal(models.Model):
    """An actual strength lift target; units remain frozen after catalog edits."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    exercise = models.ForeignKey(
        Exercise, on_delete=models.CASCADE, related_name="goals"
    )
    target_weight = models.DecimalField(max_digits=8, decimal_places=3)
    target_reps = models.PositiveIntegerField()
    weight_unit = models.CharField(max_length=3, choices=[("kg", "kg"), ("lb", "lb")])
    distance_unit = models.CharField(max_length=3, choices=[("km", "km"), ("mi", "mi")])
    rep_rule = models.CharField(
        max_length=8,
        choices=[("at_least", "At least"), ("exact", "Exactly")],
        default="at_least",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["created_at", "id"]
        constraints = [
            models.CheckConstraint(
                condition=models.Q(
                    target_weight__gt=0,
                    target_weight__lte=10000,
                    target_reps__gte=1,
                    target_reps__lte=10000,
                ),
                name="valid_exercise_goal_target",
            )
        ]


class Workout(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="workouts"
    )
    performed_on = models.DateField()
    name = models.CharField(max_length=120, default="Workout")
    notes = models.TextField(max_length=2000, blank=True)
    is_finished = models.BooleanField(default=False)
    duration_seconds = models.PositiveIntegerField(null=True, blank=True)
    timer_started_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def elapsed_at(self, now: datetime | None = None) -> int | None:
        if self.duration_seconds is None:
            return None
        running = (
            max(
                0,
                int(((now or timezone.now()) - self.timer_started_at).total_seconds()),
            )
            if self.timer_started_at
            else 0
        )
        return min(604800, self.duration_seconds + running)

    def pause_timer(self, now: datetime) -> None:
        self.duration_seconds = self.elapsed_at(now)
        self.timer_started_at = None

    class Meta:
        ordering = ["-performed_on", "-created_at", "id"]
        indexes = [
            models.Index(fields=["user", "performed_on"], name="workout_user_day_idx")
        ]
        constraints = [
            models.CheckConstraint(
                condition=models.Q(duration_seconds__isnull=True)
                | models.Q(duration_seconds__lte=604800),
                name="workout_duration_bound",
            ),
            models.CheckConstraint(
                condition=models.Q(timer_started_at__isnull=True)
                | (
                    models.Q(is_finished=False)
                    & models.Q(duration_seconds__isnull=False)
                ),
                name="workout_timer_state",
            ),
        ]


class WorkoutExercise(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    workout = models.ForeignKey(
        Workout, on_delete=models.CASCADE, related_name="exercises"
    )
    exercise = models.ForeignKey(
        Exercise, on_delete=models.RESTRICT, related_name="workout_exercises"
    )
    exercise_name = models.CharField(max_length=120)
    group_name = models.CharField(max_length=120, blank=True)
    group_colour = models.CharField(max_length=7, default="#007f68")
    category_name = models.CharField(max_length=120)
    tracking_type = models.CharField(max_length=16, choices=TrackingType.choices)
    weight_unit = models.CharField(max_length=3, choices=[("kg", "kg"), ("lb", "lb")])
    distance_unit = models.CharField(max_length=3, choices=[("km", "km"), ("mi", "mi")])
    display_order = models.PositiveIntegerField(default=100)

    class Meta:
        ordering = ["display_order", "id"]

    def clean(self) -> None:
        super().clean()
        if (
            self.workout_id
            and self.exercise_id
            and self.workout.user_id != self.exercise.category.user_id
        ):
            raise ValidationError(
                {"exercise": "Exercise must belong to the workout owner."}
            )


class WorkoutSet(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    workout_exercise = models.ForeignKey(
        WorkoutExercise, on_delete=models.CASCADE, related_name="sets"
    )
    display_order = models.PositiveIntegerField(default=100)
    weight = models.DecimalField(max_digits=10, decimal_places=3, null=True, blank=True)
    reps = models.PositiveIntegerField(null=True, blank=True)
    distance = models.DecimalField(
        max_digits=10, decimal_places=3, null=True, blank=True
    )
    duration_seconds = models.PositiveIntegerField(null=True, blank=True)
    comment = models.TextField(max_length=2000, blank=True)
    is_completed = models.BooleanField(default=True)

    class Meta:
        ordering = ["display_order", "id"]
        constraints = [
            models.CheckConstraint(
                condition=models.Q(weight__isnull=True) | models.Q(weight__gte=0),
                name="workout_set_weight_nonnegative",
            ),
            models.CheckConstraint(
                condition=models.Q(distance__isnull=True) | models.Q(distance__gt=0),
                name="workout_set_distance_positive",
            ),
            models.CheckConstraint(
                condition=models.Q(reps__isnull=True) | models.Q(reps__gt=0),
                name="workout_set_reps_positive",
            ),
            models.CheckConstraint(
                condition=models.Q(duration_seconds__isnull=True)
                | models.Q(duration_seconds__gt=0),
                name="workout_set_duration_positive",
            ),
        ]

    def clean(self) -> None:
        super().clean()
        validate_quantities(
            self.workout_exercise.tracking_type,
            {
                field: getattr(self, field)
                for field in ("weight", "reps", "distance", "duration_seconds")
            },
            self.is_completed,
        )


class WorkoutRoutine(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="workout_routines",
    )
    name = models.CharField(max_length=120)
    notes = models.TextField(max_length=2000, blank=True)
    display_order = models.PositiveIntegerField(default=100)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["display_order", "name", "id"]
        constraints = [
            models.UniqueConstraint(
                Lower("name"), "user", name="unique_workout_routine_name"
            )
        ]


class RoutineDay(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    routine = models.ForeignKey(
        WorkoutRoutine, on_delete=models.CASCADE, related_name="days"
    )
    name = models.CharField(max_length=120)
    notes = models.TextField(max_length=2000, blank=True)
    display_order = models.PositiveIntegerField(default=100)

    class Meta:
        ordering = ["display_order", "name", "id"]
        constraints = [
            models.UniqueConstraint(
                Lower("name"), "routine", name="unique_routine_day_name"
            )
        ]


class RoutineExercise(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    day = models.ForeignKey(
        RoutineDay, on_delete=models.CASCADE, related_name="exercises"
    )
    exercise = models.ForeignKey(
        Exercise, on_delete=models.RESTRICT, related_name="routine_exercises"
    )
    exercise_name = models.CharField(max_length=120)
    group_name = models.CharField(max_length=120, blank=True)
    group_colour = models.CharField(max_length=7, default="#007f68")
    category_name = models.CharField(max_length=120)
    tracking_type = models.CharField(max_length=16, choices=TrackingType.choices)
    weight_unit = models.CharField(max_length=3, choices=[("kg", "kg"), ("lb", "lb")])
    distance_unit = models.CharField(max_length=3, choices=[("km", "km"), ("mi", "mi")])
    display_order = models.PositiveIntegerField(default=100)

    class Meta:
        ordering = ["display_order", "id"]

    def clean(self) -> None:
        super().clean()
        if (
            self.day_id
            and self.exercise_id
            and self.day.routine.user_id != self.exercise.category.user_id
        ):
            raise ValidationError(
                {"exercise": "Exercise must belong to the routine owner."}
            )


class RoutineSet(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    routine_exercise = models.ForeignKey(
        RoutineExercise, on_delete=models.CASCADE, related_name="sets"
    )
    display_order = models.PositiveIntegerField(default=100)
    weight = models.DecimalField(max_digits=10, decimal_places=3, null=True, blank=True)
    reps = models.PositiveIntegerField(null=True, blank=True)
    distance = models.DecimalField(
        max_digits=10, decimal_places=3, null=True, blank=True
    )
    duration_seconds = models.PositiveIntegerField(null=True, blank=True)

    class Meta:
        ordering = ["display_order", "id"]
        constraints = [
            models.CheckConstraint(
                condition=models.Q(weight__isnull=True) | models.Q(weight__gte=0),
                name="routine_set_weight_nonnegative",
            ),
            models.CheckConstraint(
                condition=models.Q(distance__isnull=True) | models.Q(distance__gt=0),
                name="routine_set_distance_positive",
            ),
            models.CheckConstraint(
                condition=models.Q(reps__isnull=True) | models.Q(reps__gt=0),
                name="routine_set_reps_positive",
            ),
            models.CheckConstraint(
                condition=models.Q(duration_seconds__isnull=True)
                | models.Q(duration_seconds__gt=0),
                name="routine_set_duration_positive",
            ),
        ]

    def clean(self) -> None:
        super().clean()
        validate_quantities(
            self.routine_exercise.tracking_type,
            {
                field: getattr(self, field)
                for field in ("weight", "reps", "distance", "duration_seconds")
            },
            False,
        )
