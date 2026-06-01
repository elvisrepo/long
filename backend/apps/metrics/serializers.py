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

        read_only_fields = ["id", "is_default"]

    def validate_slug(self, slug: str) -> str:
          request = self.context["request"]

          if MetricDefinition.objects.filter(user=request.user, slug=slug).exists():
              raise serializers.ValidationError(
                  "You already have a custom metric with this slug."
              )

          return slug
    
    def validate(self, attrs: dict[str, Any]) -> dict[str, Any]:
          min_value = attrs["min_value"]
          max_value = attrs["max_value"]

          if min_value >= max_value:
              raise serializers.ValidationError(
                  {"max_value": "Max value must be greater than min value."}
              )

          return attrs


    def create(self, validated_data: dict[str, Any]) -> MetricDefinition:
          request = self.context["request"]
          return MetricDefinition.objects.create(
              user=request.user,
              is_default=False,
              **validated_data,
          )



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
      definition = cast(
          MetricDefinition,
          attrs.get(
              "metric_definition",
              getattr(self.instance, "metric_definition", None),
          ),
      )
      value = cast(
          float,
          attrs.get(
              "value",
              getattr(self.instance, "value", None),
          ),
      )

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
