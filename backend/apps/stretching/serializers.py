from typing import Any
from uuid import UUID

from rest_framework import serializers

from .models import StretchEntry, StretchExercise


class StretchExerciseSerializer(serializers.ModelSerializer):
    is_visible = serializers.SerializerMethodField()

    class Meta:
        model = StretchExercise
        fields = [
            "id",
            "slug",
            "phase",
            "name",
            "description",
            "dosage",
            "display_order",
            "is_visible",
        ]

    def get_is_visible(self, exercise: StretchExercise) -> bool:
        return (
            self.context["show_shared_exercises"]
            and str(exercise.id) not in self.context["hidden_exercise_ids"]
        )


class StretchPreferencesSerializer(serializers.Serializer):
    show_shared_exercises = serializers.BooleanField(required=False)
    hidden_exercise_ids = serializers.ListField(
        child=serializers.UUIDField(), required=False, allow_empty=True
    )

    def validate_hidden_exercise_ids(self, value: list[UUID]) -> list[UUID]:
        if len(value) != len(set(value)):
            raise serializers.ValidationError("Exercise IDs must be unique.")
        existing_ids = set(
            StretchExercise.objects.filter(id__in=value).values_list("id", flat=True)
        )
        if existing_ids != set(value):
            raise serializers.ValidationError("One or more exercises do not exist.")
        return value


class StretchEntrySerializer(serializers.ModelSerializer):
    exercise_id = serializers.UUIDField(read_only=True)

    class Meta:
        model = StretchEntry
        fields = ["id", "exercise_id", "performed_on", "created_at"]


class StretchRangeSerializer(serializers.Serializer):
    date_from = serializers.DateField()
    date_to = serializers.DateField()

    def validate(self, data: dict[str, Any]) -> dict[str, Any]:
        days = (data["date_to"] - data["date_from"]).days
        if not 0 <= days <= 365:
            raise serializers.ValidationError("Choose a range of 1 to 366 days.")
        return data
