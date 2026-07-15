from django.contrib.auth import get_user_model
from django.db import transaction
from django.db.models import QuerySet
from rest_framework import generics
from rest_framework.permissions import IsAuthenticated

from apps.wearables.models import WearableConnection
from apps.wearables.serializers import (
    WearableConnectionSerializer,
    WearableConnectionStatusSerializer,
)


class WearableConnectionListView(generics.ListCreateAPIView):
    serializer_class = WearableConnectionSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self) -> QuerySet[WearableConnection]:
        return WearableConnection.objects.filter(
            user=self.request.user,
            is_active=True,
        ).order_by("created_at", "id")


class WearableConnectionDetailView(generics.DestroyAPIView):
    serializer_class = WearableConnectionSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self) -> QuerySet[WearableConnection]:
        return WearableConnection.objects.filter(
            user=self.request.user,
            is_active=True,
        )

    def perform_destroy(self, instance: WearableConnection) -> None:
        with transaction.atomic():
            get_user_model().objects.select_for_update().get(
                pk=instance.user_id
            )
            instance.is_active = False
            instance.save(update_fields=("is_active", "updated_at"))


class WearableConnectionStatusView(generics.RetrieveAPIView):
    serializer_class = WearableConnectionStatusSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self) -> QuerySet[WearableConnection]:
        return WearableConnection.objects.filter(
            user=self.request.user,
            is_active=True,
        )
