from typing import Any, cast

from django.db.models import Q
from rest_framework import serializers

from apps.metrics.limits import validate_active_custom_metric_limit
from apps.metrics.models import MetricDefinition, MetricEntry


class MetricDefinitionSerializer(serializers.ModelSerializer):
    is_active = serializers.BooleanField(required=False)

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
            "is_active",
        ]

        read_only_fields = ["id", "is_default"]

    def get_fields(self) -> dict[str, serializers.Field]:
      fields = super().get_fields()

      # DRF sees that this serializer has an existing instance, meaning this is an update/retrieve path
      # incoming "slug": "daily_mood" is ignored
      if self.instance is not None:
          fields["slug"].read_only = True

      return fields

    def validate_slug(self, slug: str) -> str:
          request = self.context["request"]

          if MetricDefinition.objects.filter(user=request.user, slug=slug).exists():
              raise serializers.ValidationError(
                  "You already have a custom metric with this slug."
              )

          return slug
    
    def validate(self, attrs: dict[str, Any]) -> dict[str, Any]:
      min_value = attrs.get(
          "min_value",
          getattr(self.instance, "min_value", None),
      )
      max_value = attrs.get(
          "max_value",
          getattr(self.instance, "max_value", None),
      )

      if min_value is not None and max_value is not None and min_value >= max_value:
          raise serializers.ValidationError(
              {"max_value": "Max value must be greater than min value."}
          )

      return attrs


    def create(self, validated_data: dict[str, Any]) -> MetricDefinition:
          request = self.context["request"]
          # Remove the is_active key from the incoming create data if it exists. If it does not exist, return None and do nothing.
          # creation always produces active custom metrics; deactivation is a separate PATCH action.
          validated_data.pop("is_active", None)

          validate_active_custom_metric_limit(request.user)

          return MetricDefinition.objects.create(
              user=request.user,
              is_default=False,
              **validated_data,
          )
    
    def update(
            self,
            instance: MetricDefinition,  # existing database row being updated, before changes are applied.
            validated_data: dict[str, Any],
    ) -> MetricDefinition:
         is_reactivating = (
            instance.is_active is False   # It was inactive in the DB.
            and validated_data.get("is_active") is True  # The incoming request wants to make it active.
  )
         
         if is_reactivating:
                  validate_active_custom_metric_limit(
                      self.context["request"].user,
                      excluding_definition=instance,
                  )

          # If the request only changes name/unit/range:  validated_data == {"name": "Mood Score"}Then: validated_data.get("is_active")  # None
          # So is_reactivating is false. We do not check the active custom metric limit because the user is not adding a new active metric.
         return super().update(instance, validated_data)



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

    