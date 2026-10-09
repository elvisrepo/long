from typing import Any

from rest_framework import serializers

from .models import StretchEntry, StretchExercise


class StretchExerciseSerializer(serializers.ModelSerializer):
    class Meta:
        model = StretchExercise
        fields = ["id", "slug", "phase", "name", "description", "display_order"]


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
