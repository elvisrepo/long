from typing import Any
from rest_framework import serializers
from .models import Workout, WorkoutRoutine, RoutineDay, RoutineExercise, RoutineSet


class RoutineSetSerializer(serializers.ModelSerializer):
    class Meta:
        model = RoutineSet
        fields = [
            "id",
            "display_order",
            "weight",
            "reps",
            "distance",
            "duration_seconds",
        ]
        read_only_fields = fields


class RoutineExerciseSerializer(serializers.ModelSerializer):
    exercise_id = serializers.UUIDField(read_only=True)
    sets = RoutineSetSerializer(many=True, read_only=True)

    class Meta:
        model = RoutineExercise
        fields = [
            "id",
            "exercise_id",
            "exercise_name",
            "category_name",
            "tracking_type",
            "weight_unit",
            "distance_unit",
            "display_order",
            "sets",
        ]
        read_only_fields = fields


class RoutineDaySerializer(serializers.ModelSerializer):
    exercises = RoutineExerciseSerializer(many=True, read_only=True)
    source_workout_id = serializers.PrimaryKeyRelatedField(
        source="source_workout",
        queryset=Workout.objects.none(),
        write_only=True,
        required=False,
    )

    class Meta:
        model = RoutineDay
        fields = [
            "id",
            "name",
            "notes",
            "display_order",
            "exercises",
            "source_workout_id",
        ]
        read_only_fields = ["id", "exercises"]

    def __init__(self, *args: Any, **kwargs: Any) -> None:
        super().__init__(*args, **kwargs)
        if request := self.context.get("request"):
            self.fields["source_workout_id"].queryset = Workout.objects.filter(
                user=request.user
            ).prefetch_related("exercises__sets", "exercises__exercise__category")

    def validate_name(self, value: str) -> str:
        duplicates = RoutineDay.objects.filter(
            routine=self.context["routine"], name__iexact=value
        )
        if self.instance:
            duplicates = duplicates.exclude(pk=self.instance.pk)
        if duplicates.exists():
            raise serializers.ValidationError("This day already exists in the routine.")
        return value

    def validate(self, data: dict[str, Any]) -> dict[str, Any]:
        source = data.get("source_workout")
        if not self.instance and source is None:
            raise serializers.ValidationError(
                {"source_workout_id": "Select a saved workout."}
            )
        if source:
            items = list(source.exercises.all())
            if not items:
                raise serializers.ValidationError(
                    {
                        "source_workout_id": "Add at least one exercise to the workout first."
                    }
                )
            if any(
                item.exercise.category.user_id != self.context["request"].user.pk
                for item in items
            ):
                raise serializers.ValidationError(
                    {"source_workout_id": "Workout contains an inaccessible exercise."}
                )
        return data


class RoutineSerializer(serializers.ModelSerializer):
    days = RoutineDaySerializer(many=True, read_only=True)

    class Meta:
        model = WorkoutRoutine
        fields = ["id", "name", "notes", "display_order", "is_active", "days"]
        read_only_fields = ["id", "days"]

    def validate_name(self, value: str) -> str:
        duplicates = WorkoutRoutine.objects.filter(
            user=self.context["request"].user, name__iexact=value
        )
        if self.instance:
            duplicates = duplicates.exclude(pk=self.instance.pk)
        if duplicates.exists():
            raise serializers.ValidationError(
                "This routine already exists, including archives."
            )
        return value
