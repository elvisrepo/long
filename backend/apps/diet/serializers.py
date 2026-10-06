from typing import Any

from rest_framework import serializers

from .models import DietEntry, DietFood, DietSection


class DietSectionSerializer(serializers.ModelSerializer):
    class Meta:
        model = DietSection
        fields = ["id", "name", "display_order", "is_active"]
        read_only_fields = ["id"]

    def validate_name(self, value: str) -> str:
        duplicates = DietSection.objects.filter(
            user=self.context["request"].user, name__iexact=value
        )
        if self.instance:
            duplicates = duplicates.exclude(pk=self.instance.pk)
        if duplicates.exists():
            raise serializers.ValidationError(
                "A section with this name already exists, including archived sections."
            )
        return value


class DietFoodSerializer(serializers.ModelSerializer):
    section_id = serializers.PrimaryKeyRelatedField(
        source="section", queryset=DietSection.objects.none()
    )

    class Meta:
        model = DietFood
        fields = ["id", "section_id", "name", "display_order", "is_active"]
        read_only_fields = ["id"]

    def __init__(self, *args: Any, **kwargs: Any) -> None:
        super().__init__(*args, **kwargs)
        request = self.context.get("request")
        if request:
            self.fields["section_id"].queryset = DietSection.objects.filter(
                user=request.user
            )

    def validate(self, data: dict[str, Any]) -> dict[str, Any]:
        section = data.get("section") or (
            self.instance.section if self.instance else None
        )
        if section is None:
            raise serializers.ValidationError({"section_id": "Select a section."})
        if self.instance and section.pk != self.instance.section_id:
            raise serializers.ValidationError(
                {"section_id": "Foods cannot be moved between sections."}
            )
        if not section.is_active and (
            not self.instance or data.get("is_active") is True
        ):
            raise serializers.ValidationError(
                {"section_id": "Restore the section before adding or restoring foods."}
            )
        name = data.get("name", self.instance.name if self.instance else "")
        duplicates = DietFood.objects.filter(section=section, name__iexact=name)
        if self.instance:
            duplicates = duplicates.exclude(pk=self.instance.pk)
        if duplicates.exists():
            raise serializers.ValidationError(
                {
                    "name": "This food already exists in the section, including archived foods."
                }
            )
        return data


class DietEntrySerializer(serializers.ModelSerializer):
    food_id = serializers.UUIDField(read_only=True)

    class Meta:
        model = DietEntry
        fields = ["id", "food_id", "performed_on", "created_at"]


class DietRangeSerializer(serializers.Serializer):
    date_from = serializers.DateField()
    date_to = serializers.DateField()

    def validate(self, data: dict[str, Any]) -> dict[str, Any]:
        if not 0 <= (data["date_to"] - data["date_from"]).days <= 365:
            raise serializers.ValidationError("Choose a range of 1 to 366 days.")
        return data
