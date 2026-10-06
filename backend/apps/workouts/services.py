from django.db import transaction

from apps.users.models import User

from datetime import date
from uuid import UUID
from rest_framework.exceptions import ValidationError
from .models import (
    Exercise,
    ExerciseCategory,
    WorkoutCatalogState,
    Workout,
    WorkoutExercise,
    WorkoutSet,
)

SAMPLES = {
    "Chest": [
        ("Barbell bench press", "strength"),
        ("Dumbbell incline press", "strength"),
    ],
    "Back": [("Pull-up", "bodyweight"), ("Barbell row", "strength")],
    "Legs": [("Goblet squat", "strength"), ("Romanian deadlift", "strength")],
    "Shoulders": [("Overhead press", "strength")],
    "Arms": [("Dumbbell curl", "strength")],
    "Core": [("Plank", "duration")],
    "Cardio": [("Running", "cardio")],
}


@transaction.atomic
def initialize_catalog(user: User) -> None:
    User.objects.select_for_update().get(pk=user.pk)
    if WorkoutCatalogState.objects.filter(user=user).exists():
        return
    for order, (name, samples) in enumerate(SAMPLES.items()):
        category = ExerciseCategory.objects.filter(user=user, name__iexact=name).first()
        if category is None:
            category = ExerciseCategory.objects.create(
                user=user, name=name, display_order=order * 10
            )
        for position, (exercise_name, tracking_type) in enumerate(samples):
            if not Exercise.objects.filter(
                category=category, name__iexact=exercise_name
            ).exists():
                Exercise.objects.create(
                    category=category,
                    name=exercise_name,
                    tracking_type=tracking_type,
                    display_order=position * 10,
                )
    WorkoutCatalogState.objects.create(user=user)


def copy_workout(
    source: Workout,
    performed_on: date,
    selection: dict[UUID, set[UUID] | None] | None = None,
) -> Workout:
    """Called inside the owner-locked mutation transaction."""
    items = list(source.exercises.all())
    by_id = {item.pk: item for item in items}
    if selection is not None:
        if not selection or not selection.keys() <= by_id.keys():
            raise ValidationError(
                "Choose exercise occurrences from the source workout."
            )
        items = [item for item in items if item.pk in selection]
    for item in items:
        if item.exercise.category.user_id != source.user_id:
            raise ValidationError("Source exercises must belong to the workout owner.")
        set_ids = selection[item.pk] if selection is not None else None
        if set_ids is not None and not set_ids <= {s.pk for s in item.sets.all()}:
            raise ValidationError("Choose sets from their selected source exercise.")
    copied = Workout.objects.create(
        user=source.user, performed_on=performed_on, name=source.name
    )
    for item in items:
        selected_set_ids = selection[item.pk] if selection is not None else None
        cloned = WorkoutExercise.objects.create(
            workout=copied,
            exercise=item.exercise,
            exercise_name=item.exercise_name,
            group_name=item.group_name,
            group_colour=item.group_colour,
            category_name=item.category_name,
            tracking_type=item.tracking_type,
            weight_unit=item.weight_unit,
            distance_unit=item.distance_unit,
            display_order=item.display_order,
        )
        WorkoutSet.objects.bulk_create(
            [
                WorkoutSet(
                    workout_exercise=cloned,
                    display_order=s.display_order,
                    weight=s.weight,
                    reps=s.reps,
                    distance=s.distance,
                    duration_seconds=s.duration_seconds,
                    is_completed=False,
                )
                for s in item.sets.all()
                if selected_set_ids is None or s.pk in selected_set_ids
            ]
        )
    return copied
