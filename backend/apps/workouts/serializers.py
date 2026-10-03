from typing import Any
from decimal import Decimal
from django.core.exceptions import ValidationError as ModelValidationError
from django.utils import timezone

from rest_framework import serializers

from .models import (
    Exercise,
    ExerciseCategory,
    Workout,
    WorkoutExercise,
    WorkoutSet,
    WorkoutPreferences,
)
from .progress_queries import METRICS


class PlateSerializer(serializers.Serializer):
    weight = serializers.DecimalField(
        max_digits=7,
        decimal_places=3,
        min_value=Decimal("0.001"),
        max_value=Decimal("1000"),
    )
    count = serializers.IntegerField(min_value=0, max_value=100)


class PreferencesSerializer(serializers.ModelSerializer):
    plates_kg = PlateSerializer(
        many=True, max_length=20, allow_empty=True, required=False
    )
    plates_lb = PlateSerializer(
        many=True, max_length=20, allow_empty=True, required=False
    )
    bar_kg = serializers.DecimalField(
        max_digits=7,
        decimal_places=3,
        min_value=Decimal("0"),
        max_value=Decimal("1000"),
        required=False,
    )
    bar_lb = serializers.DecimalField(
        max_digits=7,
        decimal_places=3,
        min_value=Decimal("0"),
        max_value=Decimal("1000"),
        required=False,
    )

    class Meta:
        model = WorkoutPreferences
        fields = [
            "auto_start_rest",
            "auto_advance_groups",
            "bar_kg",
            "bar_lb",
            "plates_kg",
            "plates_lb",
        ]

    def validate(self, data: dict[str, Any]) -> dict[str, Any]:
        for field in ("plates_kg", "plates_lb"):
            if field in data:
                weights = [plate["weight"] for plate in data[field]]
                if len(weights) != len(set(weights)):
                    raise serializers.ValidationError(
                        {field: "Use each plate size only once."}
                    )
                data[field] = [
                    {"weight": str(plate["weight"]), "count": plate["count"]}
                    for plate in data[field]
                ]
        return data


class CategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = ExerciseCategory
        fields = ["id", "name", "display_order", "is_active"]
        read_only_fields = ["id"]

    def validate_name(self, value: str) -> str:
        duplicates = ExerciseCategory.objects.filter(
            user=self.context["request"].user, name__iexact=value
        )
        if self.instance:
            duplicates = duplicates.exclude(pk=self.instance.pk)
        if duplicates.exists():
            raise serializers.ValidationError(
                "This category already exists, including archives."
            )
        return value


class ExerciseSerializer(serializers.ModelSerializer):
    default_graph = serializers.ChoiceField(
        choices=["", *METRICS, "personal_records"], required=False, allow_blank=True
    )
    trained_session_count = serializers.IntegerField(read_only=True, default=0)
    last_used_on = serializers.DateField(read_only=True, default=None)
    category_id = serializers.PrimaryKeyRelatedField(
        source="category", queryset=ExerciseCategory.objects.none()
    )
    weight_increment = serializers.DecimalField(
        max_digits=7, decimal_places=3, min_value=Decimal("0.001"), required=False
    )
    rest_seconds = serializers.IntegerField(min_value=0, max_value=3600, required=False)

    class Meta:
        model = Exercise
        fields = [
            "id",
            "category_id",
            "name",
            "tracking_type",
            "weight_unit",
            "distance_unit",
            "notes",
            "weight_increment",
            "rest_seconds",
            "display_order",
            "is_active",
            "is_favorite",
            "default_graph",
            "trained_session_count",
            "last_used_on",
        ]
        read_only_fields = ["id"]

    def __init__(self, *args: Any, **kwargs: Any) -> None:
        super().__init__(*args, **kwargs)
        if request := self.context.get("request"):
            self.fields["category_id"].queryset = ExerciseCategory.objects.filter(
                user=request.user
            )

    def validate(self, data: dict[str, Any]) -> dict[str, Any]:
        category = data.get(
            "category", self.instance.category if self.instance else None
        )
        if not category:
            raise serializers.ValidationError({"category_id": "Select a category."})
        if not category.is_active and (
            not self.instance or data.get("is_active") is True or "category" in data
        ):
            raise serializers.ValidationError(
                {"category_id": "Restore the category first."}
            )
        duplicates = Exercise.objects.filter(
            category=category,
            name__iexact=data.get("name", self.instance.name if self.instance else ""),
        )
        if self.instance:
            duplicates = duplicates.exclude(pk=self.instance.pk)
        if duplicates.exists():
            raise serializers.ValidationError(
                {"name": "This exercise already exists, including archives."}
            )
        return data


class SetSerializer(serializers.ModelSerializer):
    weight = serializers.DecimalField(
        max_digits=10,
        decimal_places=3,
        min_value=Decimal("0"),
        required=False,
        allow_null=True,
    )
    distance = serializers.DecimalField(
        max_digits=10,
        decimal_places=3,
        min_value=Decimal("0.001"),
        required=False,
        allow_null=True,
    )
    reps = serializers.IntegerField(
        min_value=1, max_value=100000, required=False, allow_null=True
    )
    duration_seconds = serializers.IntegerField(
        min_value=1, max_value=2147483647, required=False, allow_null=True
    )

    class Meta:
        model = WorkoutSet
        fields = [
            "id",
            "display_order",
            "weight",
            "reps",
            "distance",
            "duration_seconds",
            "comment",
            "is_completed",
        ]
        read_only_fields = ["id"]

    def validate(self, data: dict[str, Any]) -> dict[str, Any]:
        item = (
            self.instance.workout_exercise
            if self.instance
            else self.context["workout_exercise"]
        )
        fields = [
            "weight",
            "reps",
            "distance",
            "duration_seconds",
            "comment",
            "is_completed",
        ]
        combined = {
            field: data.get(
                field,
                getattr(self.instance, field)
                if self.instance
                else (
                    True
                    if field == "is_completed"
                    else ""
                    if field == "comment"
                    else None
                ),
            )
            for field in fields
        }
        candidate = WorkoutSet(workout_exercise=item, **combined)
        try:
            candidate.clean()
        except ModelValidationError as error:
            raise serializers.ValidationError(error.message_dict) from error
        return data


class WorkoutExerciseSerializer(serializers.ModelSerializer):
    exercise_id = serializers.PrimaryKeyRelatedField(
        source="exercise", queryset=Exercise.objects.none()
    )
    sets = SetSerializer(many=True, read_only=True)

    class Meta:
        model = WorkoutExercise
        fields = [
            "id",
            "exercise_id",
            "exercise_name",
            "group_name",
            "group_colour",
            "category_name",
            "tracking_type",
            "weight_unit",
            "distance_unit",
            "display_order",
            "sets",
        ]
        read_only_fields = [
            "id",
            "exercise_name",
            "group_colour",
            "category_name",
            "tracking_type",
            "weight_unit",
            "distance_unit",
        ]

    def __init__(self, *args: Any, **kwargs: Any) -> None:
        super().__init__(*args, **kwargs)
        if request := self.context.get("request"):
            self.fields["exercise_id"].queryset = Exercise.objects.filter(
                category__user=request.user, category__is_active=True, is_active=True
            )


class WorkoutSerializer(serializers.ModelSerializer):
    exercises = WorkoutExerciseSerializer(many=True, read_only=True)
    completed_set_count = serializers.SerializerMethodField()
    duration_seconds = serializers.IntegerField(
        min_value=0, max_value=604800, allow_null=True, required=False
    )
    timer_action = serializers.ChoiceField(
        choices=["start", "pause"], write_only=True, required=False
    )
    elapsed_seconds = serializers.SerializerMethodField()
    timer_server_now = serializers.SerializerMethodField()

    def get_elapsed_seconds(self, obj: Workout) -> int | None:
        return obj.elapsed_at()

    def get_timer_server_now(self, obj: Workout) -> str:
        return timezone.now().isoformat()

    def validate(self, data: dict[str, Any]) -> dict[str, Any]:
        action = data.get("timer_action")
        if action and (self.instance is None or "duration_seconds" in data):
            raise serializers.ValidationError(
                "Timer actions require an existing workout and cannot accompany a duration correction."
            )
        finished = data.get(
            "is_finished", self.instance.is_finished if self.instance else False
        )
        if action == "start" and finished:
            raise serializers.ValidationError(
                "Reopen the workout before starting its timer."
            )
        return data

    def update(self, instance: Workout, validated_data: dict[str, Any]) -> Workout:
        action = validated_data.pop("timer_action", None)
        now = timezone.now()
        if (
            action == "pause"
            or "duration_seconds" in validated_data
            or validated_data.get("is_finished")
        ):
            instance.pause_timer(now)
        elif action == "start" and instance.timer_started_at is None:
            instance.duration_seconds = instance.duration_seconds or 0
            instance.timer_started_at = now
        return super().update(instance, validated_data)

    def get_completed_set_count(self, obj: Workout) -> int:
        return sum(
            s.is_completed for item in obj.exercises.all() for s in item.sets.all()
        )

    class Meta:
        model = Workout
        fields = [
            "id",
            "performed_on",
            "name",
            "notes",
            "is_finished",
            "duration_seconds",
            "timer_started_at",
            "elapsed_seconds",
            "timer_server_now",
            "timer_action",
            "created_at",
            "exercises",
            "completed_set_count",
        ]
        read_only_fields = ["id", "created_at", "exercises", "timer_started_at"]


class WorkoutRangeSerializer(serializers.Serializer):
    date_from = serializers.DateField()
    date_to = serializers.DateField()
    exercise_id = serializers.UUIDField(required=False)

    def validate(self, data: dict[str, Any]) -> dict[str, Any]:
        if not 0 <= (data["date_to"] - data["date_from"]).days <= 365:
            raise serializers.ValidationError("Choose a range of 1 to 366 days.")
        return data


class CopySerializer(serializers.Serializer):
    performed_on = serializers.DateField()


class CopyItemSerializer(serializers.Serializer):
    item_id = serializers.UUIDField()
    set_ids = serializers.ListField(
        child=serializers.UUIDField(), max_length=1000, required=False
    )

    def to_internal_value(self, data: Any) -> dict[str, Any]:
        if isinstance(data, dict) and set(data) - {"item_id", "set_ids"}:
            raise serializers.ValidationError(
                "Only item_id and set_ids can be supplied."
            )
        return super().to_internal_value(data)

    def validate(self, data: dict[str, Any]) -> dict[str, Any]:
        ids = data.get("set_ids", [])
        if len(ids) != len(set(ids)):
            raise serializers.ValidationError("Set IDs must be unique.")
        return data


class SessionCopySerializer(CopySerializer):
    selection = CopyItemSerializer(
        many=True, required=False, allow_empty=False, max_length=100
    )

    def validate(self, data: dict[str, Any]) -> dict[str, Any]:
        if set(self.initial_data) - set(self.fields):
            raise serializers.ValidationError(
                "Only performed_on and selection can be supplied."
            )
        ids = [item["item_id"] for item in data.get("selection", [])]
        if len(ids) != len(set(ids)):
            raise serializers.ValidationError("Exercise occurrences must be unique.")
        return data


class ExerciseSettingsSerializer(serializers.Serializer):
    display_order = serializers.IntegerField(
        min_value=0, max_value=2147483647, required=False
    )
    group_name = serializers.CharField(max_length=120, allow_blank=True, required=False)

    def validate(self, data: dict[str, Any]) -> dict[str, Any]:
        if not data:
            raise serializers.ValidationError("Supply order or a group label.")
        return data


class GroupNameSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=120)


class GroupSerializer(GroupNameSerializer):
    original_name = serializers.CharField(max_length=120, required=False)
    colour = serializers.RegexField(r"^#[0-9a-fA-F]{6}$")
    member_ids = serializers.ListField(
        child=serializers.UUIDField(), max_length=100, default=list
    )
    add_exercise_ids = serializers.ListField(
        child=serializers.UUIDField(), max_length=100, default=list
    )

    def validate_colour(self, value: str) -> str:
        return value.lower()

    def validate(self, data: dict[str, Any]) -> dict[str, Any]:
        if not data["member_ids"] and not data["add_exercise_ids"]:
            raise serializers.ValidationError("Choose at least one exercise.")
        for field in ["member_ids", "add_exercise_ids"]:
            if len(data[field]) != len(set(data[field])):
                raise serializers.ValidationError("Choose each exercise only once.")
        return data
