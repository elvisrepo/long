from typing import Any
from uuid import UUID

from rest_framework import serializers
from rest_framework.exceptions import ValidationError

from .models import StretchEntry, StretchExercise
from .storage import stretch_image_url


class StretchExerciseSerializer(serializers.ModelSerializer):
    is_visible = serializers.SerializerMethodField()
    is_custom = serializers.SerializerMethodField()
    image_url = serializers.SerializerMethodField()

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
            "is_custom",
            "is_active",
            "image_url",
        ]

    def get_is_visible(self, exercise: StretchExercise) -> bool:
        if exercise.user_id is not None:
            return True
        return (
            self.context["show_shared_exercises"]
            and str(exercise.id) not in self.context["hidden_exercise_ids"]
        )

    def get_is_custom(self, exercise: StretchExercise) -> bool:
        return exercise.user_id is not None

    def get_image_url(self, exercise: StretchExercise) -> str | None:
        if not exercise.image_key:
            return None
        return stretch_image_url(exercise.image_key)


class CustomStretchExerciseSerializer(serializers.ModelSerializer):
    image = serializers.ImageField(required=False, write_only=True, allow_null=True)
    remove_image = serializers.BooleanField(required=False, write_only=True)
    is_active = serializers.BooleanField(required=False, default=True)

    class Meta:
        model = StretchExercise
        fields = [
            "phase",
            "name",
            "description",
            "dosage",
            "image",
            "remove_image",
            "is_active",
        ]
        extra_kwargs = {
            "phase": {"required": True},
            "name": {"required": True, "max_length": 120},
            "description": {"required": False, "max_length": 500},
            "dosage": {"required": False, "max_length": 120},
        }

    def validate(self, attrs: dict[str, object]) -> dict[str, object]:
        if attrs.get("image") and attrs.get("remove_image"):
            raise ValidationError("Choose an image or remove the current image.")
        return attrs


class StretchPreferencesSerializer(serializers.Serializer):
    show_shared_exercises = serializers.BooleanField(required=False)
    hidden_exercise_ids = serializers.ListField(
        child=serializers.UUIDField(), required=False, allow_empty=True
    )

    def validate_hidden_exercise_ids(self, value: list[UUID]) -> list[UUID]:
        if len(value) != len(set(value)):
            raise serializers.ValidationError("Exercise IDs must be unique.")
        existing_ids = set(
            StretchExercise.objects.filter(id__in=value, user__isnull=True).values_list(
                "id", flat=True
            )
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
