from django.db.models import QuerySet
from rest_framework import generics
from rest_framework.permissions import IsAuthenticated

from apps.wearables.models import WearableConnection
from apps.wearables.serializers import WearableConnectionSerializer


class WearableConnectionListView(generics.ListAPIView):
    serializer_class = WearableConnectionSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self) -> QuerySet[WearableConnection]:
        return WearableConnection.objects.filter(user=self.request.user).order_by(
            "created_at",
            "id",
        )
