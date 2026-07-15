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
        return WearableConnection.objects.filter(user=self.request.user).order_by(
            "created_at",
            "id",
        )


class WearableConnectionDetailView(generics.DestroyAPIView):
    serializer_class = WearableConnectionSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self) -> QuerySet[WearableConnection]:
        return WearableConnection.objects.filter(user=self.request.user)


class WearableConnectionStatusView(generics.RetrieveAPIView):
    serializer_class = WearableConnectionStatusSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self) -> QuerySet[WearableConnection]:
        return WearableConnection.objects.filter(user=self.request.user)
