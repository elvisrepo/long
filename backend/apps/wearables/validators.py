from django.contrib.auth.models import AbstractBaseUser
from rest_framework import serializers

from apps.wearables.models import WearableConnection


DUPLICATE_PROVIDER_MESSAGE = "This provider is already registered."


def validate_wearable_connection_provider_available(
    user: AbstractBaseUser,
    *,
    provider: str,
) -> None:
    if WearableConnection.objects.filter(
        user=user,
        provider=provider,
        is_active=True,
    ).exists():
        raise serializers.ValidationError(
            {"provider": [DUPLICATE_PROVIDER_MESSAGE]}
        )
