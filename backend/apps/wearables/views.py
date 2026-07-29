from django.contrib.auth import get_user_model
from django.db import transaction
from django.db.models import QuerySet
from django.shortcuts import get_object_or_404
from rest_framework import generics, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response

from apps.wearables.models import WearableConnection
from apps.wearables.serializers import (
    SyncRunSerializer,
    WearableConnectionSerializer,
    WearableConnectionStatusSerializer,
    WearableUploadBatchSerializer,
)
from apps.wearables.services import (
    WearableIngestionConflictError,
    process_wearable_upload,
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


class WearableUploadView(generics.GenericAPIView):
    serializer_class = WearableUploadBatchSerializer
    # 1. Authenticate the request and populate request.user.
    permission_classes = [IsAuthenticated]

    def post(self, request: Request) -> Response:
        # 2. Validate IDs and every normalized entry in the bounded batch.
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        # 3. Find an active connection owned by the authenticated caller.
        connection = get_object_or_404(
            WearableConnection,
            id=serializer.validated_data["connection_id"],
            user=request.user,
            is_active=True,
        )

        # 4. Atomically process a new batch or reuse an exact retry.
        try:
            sync_run, created = process_wearable_upload(
                connection=connection,
                upload_id=serializer.validated_data["upload_id"],
                entries=serializer.validated_data["entries"],
            )
        except WearableIngestionConflictError as exc:
            return Response(
                {"detail": str(exc)},
                status=status.HTTP_409_CONFLICT,
            )

        # 5. Return 201 for new work and 200 for an exact idempotent retry.
        response_status = (
            status.HTTP_201_CREATED if created else status.HTTP_200_OK
        )
        return Response(
            SyncRunSerializer(sync_run).data,
            status=response_status,
        )
