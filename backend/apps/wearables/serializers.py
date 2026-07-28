"""Validation and representation boundaries for wearable API data."""

from collections.abc import Mapping
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

# Clients choose a provider only; ownership and lifecycle state stay trusted.
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

# The first ingestion slice deliberately maps only Health Connect weight data.
SUPPORTED_WEARABLE_METRIC_SLUGS = frozenset({"body_weight"})

# Keep future synchronous ingestion requests small and predictable.
MAX_WEARABLE_UPLOAD_ENTRIES = 100

UNSUPPORTED_FIELD_MESSAGE = "This field is not supported."
UNSUPPORTED_UPLOAD_FIELD_MESSAGE = "This field is not supported yet."


class StrictFieldsSerializer(serializers.Serializer):
    """Reject undeclared keys before DRF can silently discard them."""

    unsupported_field_message = UNSUPPORTED_FIELD_MESSAGE

    def to_internal_value(self, data: Any) -> dict[str, Any]:
        # Let DRF produce its normal type error when the input is not an object.
        if isinstance(data, Mapping):
            # Compare raw request keys with the serializer's declared contract.
            unsupported_fields = sorted(set(data) - set(self.fields))
            if unsupported_fields:
                raise serializers.ValidationError(
                    {
                        field: [self.unsupported_field_message]
                        for field in unsupported_fields
                    }
                )

        # Declared fields still use DRF's normal parsing and validation.
        return cast(
            dict[str, Any],
            super().to_internal_value(data),
        )


class WearableConnectionSerializer(serializers.ModelSerializer):
    """Read connections and register/reactivate one for the request user."""

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
        # Reject lifecycle or ownership fields rather than silently ignoring
        # values that only trusted backend code may set.
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
            # Serialize plan-slot checks and connection writes for this user.
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

            # Disconnect is a soft delete, so registration restores the
            # durable provider row instead of creating a second identity.
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
    """Return the caller-owned connection's current sync state."""

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


class WearableUploadEntrySerializer(StrictFieldsSerializer):
    """Validate one future normalized health record without saving it."""

    # Resolve the stable public slug to a supported active system definition.
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
        # The definition owns the accepted domain range for this metric.
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


class WearableUploadBatchSerializer(StrictFieldsSerializer):
    """Validate the future bounded batch contract without exposing it yet."""

    connection_id = serializers.UUIDField()
    upload_id = serializers.UUIDField()
    entries = WearableUploadEntrySerializer(
        many=True,
        allow_empty=False,
        max_length=MAX_WEARABLE_UPLOAD_ENTRIES,
    )


class WearableUploadSerializer(StrictFieldsSerializer):
    """Validate the live receipt-only request used by WearableUploadView."""

    # `entries` remains unsupported until hashing and persistence are ready.
    unsupported_field_message = UNSUPPORTED_UPLOAD_FIELD_MESSAGE

    connection_id = serializers.UUIDField()
    upload_id = serializers.UUIDField()


class SyncRunSerializer(serializers.ModelSerializer):
    """Render a saved SyncRun receipt; clients cannot mutate its state."""

    # Expose the foreign-key UUID under the public API's connection_id name.
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
