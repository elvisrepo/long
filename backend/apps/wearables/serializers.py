from rest_framework import serializers

from apps.wearables.models import WearableConnection


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
