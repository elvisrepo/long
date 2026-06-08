from typing import Any, cast

from django.contrib.auth import get_user_model
from django.db import transaction
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
      validated_data.pop("is_active", None)

      with transaction.atomic():
          # Serialize entitlement-changing writes for the same user.
          locked_user = (
              get_user_model()
              .objects.select_for_update()
              .get(pk=request.user.pk)
          )

          validate_active_custom_metric_limit(locked_user)

          return MetricDefinition.objects.create(
              user=locked_user,
              is_default=False,
              is_active=True,
              **validated_data,
          )


    
    def update(
        self,
        instance: MetricDefinition,
        validated_data: dict[str, Any],
    ) -> MetricDefinition:
        is_reactivating = (
            instance.is_active is False
            and validated_data.get("is_active") is True
        )
        if not is_reactivating:
            return super().update(instance, validated_data)

        with transaction.atomic():
            locked_user = (
                get_user_model()
                .objects.select_for_update()
                .get(pk=self.context["request"].user.pk)
            )

            # Reload after acquiring the user lock so validation uses current state.
            locked_definition = MetricDefinition.objects.get(pk=instance.pk)

            validate_active_custom_metric_limit(
                locked_user,
                excluding_definition=locked_definition,
            )

            return super().update(locked_definition, validated_data)



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
