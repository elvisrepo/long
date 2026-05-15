from typing import Any, cast

from django.db.models import Q
from rest_framework import serializers

from apps.metrics.models import MetricDefinition, MetricEntry


class MetricDefinitionSerializer(serializers.ModelSerializer):
    class Meta:
        model = MetricDefinition
        fields = [
            "id",
            "name",
            "slug",
            "unit",
            "category",
            "min_value",
            "max_value",
            "is_default",
        ]


class MetricEntrySerializer(serializers.ModelSerializer):
    # The public API accepts the stable metric slug instead of exposing DB UUIDs.
    metric_definition = serializers.SlugRelatedField(
        slug_field="slug",
        queryset=MetricDefinition.objects.none(),
    )

    class Meta:
        model = MetricEntry
        fields = [
            "id",
            "metric_definition",
            "value",
            "recorded_at",
            "source",
            "context",
            "created_at",
        ]
        read_only_fields = ["id", "source", "created_at"]

    def __init__(self, *args: object, **kwargs: object) -> None:
        super().__init__(*args, **kwargs)

        request = self.context.get("request")
        if request is None:
            return

        # Scope the slug lookup so users cannot create entries against another
        # user's custom metric definition.
        self.fields["metric_definition"].queryset = MetricDefinition.objects.filter(
            Q(user__isnull=True) | Q(user=request.user),
            is_active=True,
        )

    def validate(self, attrs: dict[str, Any]) -> dict[str, Any]:
        definition = cast(MetricDefinition, attrs["metric_definition"])
        value = cast(float, attrs["value"])

        if value < definition.min_value or value > definition.max_value:
            raise serializers.ValidationError(
                {
                    "value": (
                        f"Value must be between {definition.min_value} "
                        f"and {definition.max_value}."
                    )
                }
            )

        return attrs

    def create(self, validated_data: dict[str, Any]) -> MetricEntry:
        request = self.context["request"]
        return MetricEntry.objects.create(
            user=request.user,
            **validated_data,
        )
