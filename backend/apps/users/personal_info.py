import json
import math
from datetime import date
from typing import Any

from django.db import transaction
from django.utils import timezone
from rest_framework import serializers

from apps.users.models import User, decrypt_value, encrypt_value
from apps.metrics.models import MetricEntry


class PersonalInfoSerializer(serializers.Serializer):
    date_of_birth = serializers.DateField(required=False, allow_null=True)
    sex = serializers.ChoiceField(
        choices=["male", "female"], required=False, allow_null=True
    )
    height_cm = serializers.FloatField(
        required=False, allow_null=True, min_value=50, max_value=250
    )

    def validate_date_of_birth(self, value: date | None) -> date | None:
        today = timezone.now().date()
        if value is not None and (value > today or today.year - value.year > 120):
            raise serializers.ValidationError(
                "Enter a date of birth within the past 120 years."
            )
        return value

    def validate_height_cm(self, value: float | None) -> float | None:
        if value is not None and not math.isfinite(value):
            raise serializers.ValidationError(
                "Enter a finite height between 50 and 250 cm."
            )
        return value

    def validate(self, attrs: dict[str, Any]) -> dict[str, Any]:
        unknown = set(self.initial_data) - set(self.fields)
        if unknown:
            raise serializers.ValidationError(
                {key: ["Unknown field."] for key in unknown}
            )
        return attrs


def personal_info(user: User) -> dict[str, Any]:
    fields: dict[str, Any] = {"date_of_birth": None, "sex": None, "height_cm": None}
    if user.personal_info_encrypted:
        fields.update(json.loads(decrypt_value(user.personal_info_encrypted)))
    return fields


@transaction.atomic
def update_personal_info(user: User, changes: dict[str, Any]) -> User:
    locked_user = User.objects.select_for_update().get(pk=user.pk)
    fields = personal_info(locked_user)
    fields.update(changes)
    locked_user.personal_info_encrypted = encrypt_value(json.dumps(fields, default=str))
    locked_user.save(update_fields=["personal_info_encrypted"])
    return locked_user


def profile_response(user: User) -> dict[str, Any]:
    fields = personal_info(user)
    now = timezone.now()
    today = now.date()
    birthday = (
        date.fromisoformat(fields["date_of_birth"]) if fields["date_of_birth"] else None
    )
    age = (
        (
            today.year
            - birthday.year
            - ((today.month, today.day) < (birthday.month, birthday.day))
        )
        if birthday
        else None
    )
    weight = (
        MetricEntry.objects.filter(
            user=user,
            metric_definition__user__isnull=True,
            metric_definition__is_default=True,
            metric_definition__is_active=True,
            metric_definition__slug="body_weight",
            metric_definition__unit="kg",
            recorded_at__lte=now,
        )
        .order_by("-recorded_at", "-id")
        .first()
    )
    missing = [key for key, value in fields.items() if value is None]
    if weight is None:
        missing.append("body_weight")
    estimate: dict[str, Any] = {
        "value": None,
        "unit": "kcal/day",
        "formula": "mifflin_st_jeor",
        "missing_fields": missing,
        "reason": "missing_information" if missing else None,
        "weight": {
            "value": weight.value,
            "recorded_at": weight.recorded_at,
            "source": weight.source,
            "entry_id": weight.pk,
        }
        if weight and math.isfinite(weight.value)
        else None,
    }
    if not missing and age is not None and weight is not None:
        if age < 18:
            estimate["reason"] = "adult_only"
        elif not math.isfinite(weight.value) or not 20 <= weight.value <= 400:
            estimate["reason"] = "invalid_weight"
        else:
            # Mifflin et al. 1990, doi:10.1093/ajcn/51.2.241. No activity multiplier.
            value = (
                10 * weight.value
                + 6.25 * fields["height_cm"]
                - 5 * age
                + (5 if fields["sex"] == "male" else -161)
            )
            if value > 0:
                estimate["value"] = round(value)
            else:
                estimate["reason"] = "invalid_inputs"
    return {**fields, "age": age, "estimated_bmr": estimate}
