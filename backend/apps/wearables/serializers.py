from typing import Any, cast

from django.contrib.auth import get_user_model
from django.db import transaction
from rest_framework import serializers

from apps.metrics.models import MetricDefinition, MetricEntry
from apps.wearables.limits import validate_wearable_connection_limit
from apps.wearables.models import SyncRun, WearableConnection
from apps.wearables.validators import (
    validate_wearable_connection_provider_available,
)


SERVER_MANAGED_FIELDS = frozenset(
    {
        "id",
        "user",
        "user_id",
        "status",
        "last_synced_at",
        "last_error",
        "is_active",
        "created_at",
        "updated_at",
    }
)
SERVER_MANAGED_FIELD_MESSAGE = "This field is server-managed."
SUPPORTED_WEARABLE_METRIC_SLUGS = frozenset({"body_weight"})


class WearableConnectionSerializer(serializers.ModelSerializer):
    class Meta:
        model = WearableConnection
        fields = (
            "id",
            "provider",
            "status",
            "last_synced_at",
            "last_error",
            "created_at",
            "updated_at",
        )
        read_only_fields = (
            "id",
            "status",
            "last_synced_at",
            "last_error",
            "created_at",
            "updated_at",
        )

    def validate(self, attrs: dict[str, Any]) -> dict[str, Any]:
        supplied_server_managed_fields = sorted(
            SERVER_MANAGED_FIELDS.intersection(self.initial_data)
        )
        if supplied_server_managed_fields:
            raise serializers.ValidationError(
                {
                    field: [SERVER_MANAGED_FIELD_MESSAGE]
                    for field in supplied_server_managed_fields
                }
            )

        return attrs

    def create(self, validated_data: dict[str, Any]) -> WearableConnection:
        request = self.context["request"]

        with transaction.atomic():
            locked_user = (
                get_user_model()
                .objects.select_for_update()
                .get(pk=request.user.pk)
            )
            validate_wearable_connection_provider_available(
                locked_user,
                provider=validated_data["provider"],
            )
            validate_wearable_connection_limit(locked_user)

            inactive_connection = (
                WearableConnection.objects.select_for_update()
                .filter(
                    user=locked_user,
                    provider=validated_data["provider"],
                    is_active=False,
                )
                .first()
            )
            if inactive_connection is not None:
                inactive_connection.is_active = True
                inactive_connection.status = (
                    WearableConnection.Status.PENDING
                )
                inactive_connection.last_error = ""
                inactive_connection.save(
                    update_fields=(
                        "is_active",
                        "status",
                        "last_error",
                        "updated_at",
                    )
                )
                return inactive_connection

            return WearableConnection.objects.create(
                user=locked_user,
                **validated_data,
            )


class WearableConnectionStatusSerializer(serializers.ModelSerializer):
    class Meta:
        model = WearableConnection
        fields = (
            "id",
            "provider",
            "status",
            "last_synced_at",
            "last_error",
        )
        read_only_fields = fields


class WearableUploadEntrySerializer(serializers.Serializer):
    metric_definition = serializers.SlugRelatedField(
        slug_field="slug",
        queryset=MetricDefinition.objects.filter(
            user__isnull=True,
            is_default=True,
            is_active=True,
            slug__in=SUPPORTED_WEARABLE_METRIC_SLUGS,
        ),
    )
    value = serializers.FloatField()
    recorded_at = serializers.DateTimeField()
    source = serializers.ChoiceField(
        choices=(MetricEntry.Source.SAMSUNG_HEALTH,),
    )
    external_source_id = serializers.CharField(
        max_length=255,
        allow_blank=False,
        trim_whitespace=True,
    )

    def validate(self, attrs: dict[str, Any]) -> dict[str, Any]:
        definition = cast(
            MetricDefinition,
            attrs["metric_definition"],
        )
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


class WearableUploadSerializer(serializers.Serializer):
    connection_id = serializers.UUIDField()
    upload_id = serializers.UUIDField()


class SyncRunSerializer(serializers.ModelSerializer):
    connection_id = serializers.UUIDField(
        source="wearable_connection_id",
        read_only=True,
    )

    class Meta:
        model = SyncRun
        fields = (
            "id",
            "connection_id",
            "upload_id",
            "status",
            "received_at",
            "processing_started_at",
            "finished_at",
            "entries_imported",
            "entries_skipped",
        )
        read_only_fields = fields
