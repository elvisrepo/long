from django.contrib.auth.models import AbstractBaseUser
from rest_framework import serializers

from apps.subscriptions.services import get_current_subscription_plan
from apps.wearables.models import WearableConnection


WEARABLE_CONNECTION_LIMIT_MESSAGE = "Wearable connection limit reached."


def validate_wearable_connection_limit(user: AbstractBaseUser) -> None:
    plan = get_current_subscription_plan(user)
    used = WearableConnection.objects.filter(user=user).count()

    if used >= plan.wearable_connection_limit:
        raise serializers.ValidationError(
            {"non_field_errors": [WEARABLE_CONNECTION_LIMIT_MESSAGE]}
        )
