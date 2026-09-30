from typing import Any

from rest_framework import serializers

from .evidence import DOMS_ESTIMATES, SOURCE_URL
from .models import RecoveryEntry, RecoveryTool


class RecoveryToolSerializer(serializers.ModelSerializer):
    is_custom = serializers.SerializerMethodField()
    evidence = serializers.SerializerMethodField()

    class Meta:
        model = RecoveryTool
        fields = ["id", "name", "description", "is_active", "is_custom", "evidence"]
        read_only_fields = ["id", "is_custom", "evidence"]

    def get_is_custom(self, tool: RecoveryTool) -> bool:
        return tool.user_id is not None

    def get_evidence(self, tool: RecoveryTool) -> dict[str, Any] | None:
        if tool.user_id is not None or tool.slug not in DOMS_ESTIMATES:
            return None
        smd, lower, upper, subjects, groups = DOMS_ESTIMATES[tool.slug]
        return {
            "outcome": "doms",
            "smd": smd,
            "ci_lower": lower,
            "ci_upper": upper,
            "subjects": subjects,
            "experimental_groups": groups,
            "source_url": SOURCE_URL,
            "citation": "Dupuy et al. (2018), Table 1",
        }


class RecoveryEntrySerializer(serializers.ModelSerializer):
    tool_id = serializers.UUIDField(read_only=True)

    class Meta:
        model = RecoveryEntry
        fields = ["id", "tool_id", "performed_on", "created_at"]


class RecoveryRangeSerializer(serializers.Serializer):
    date_from = serializers.DateField()
    date_to = serializers.DateField()

    def validate(self, data: dict[str, Any]) -> dict[str, Any]:
        days = (data["date_to"] - data["date_from"]).days
        if not 0 <= days <= 365:
            raise serializers.ValidationError("Choose a range of 1 to 366 days.")
        return data
