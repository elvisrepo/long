from django.db import transaction
from django.db.models import Q
from django.shortcuts import get_object_or_404
from rest_framework import serializers
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.subscriptions.services import get_current_subscription_plan
from apps.users.models import User

from .models import RecoveryEntry, RecoveryTool
from .serializers import (
    RecoveryEntrySerializer,
    RecoveryRangeSerializer,
    RecoveryToolSerializer,
)


class RecoveryToolsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request: Request) -> Response:
        tools = RecoveryTool.objects.filter(Q(user=None) | Q(user=request.user))
        return Response(
            {
                "tools": RecoveryToolSerializer(tools, many=True).data,
                "can_create_custom": get_current_subscription_plan(request.user).code
                == "pro",
            }
        )

    @transaction.atomic
    def post(self, request: Request) -> Response:
        User.objects.select_for_update().get(pk=request.user.pk)
        if get_current_subscription_plan(request.user).code != "pro":
            raise PermissionDenied("Pro is required to add custom recovery tools.")
        serializer = RecoveryToolSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save(user=request.user, slug="", is_active=True)
        return Response(serializer.data, status=201)


class RecoveryEntriesView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request: Request) -> Response:
        dates = RecoveryRangeSerializer(data=request.query_params)
        dates.is_valid(raise_exception=True)
        entries = RecoveryEntry.objects.filter(
            user=request.user,
            performed_on__range=(
                dates.validated_data["date_from"],
                dates.validated_data["date_to"],
            ),
        )
        return Response(RecoveryEntrySerializer(entries, many=True).data)


class RecoveryToolDetailView(APIView):
    permission_classes = [IsAuthenticated]

    @transaction.atomic
    def patch(self, request: Request, tool_id: str) -> Response:
        User.objects.select_for_update().get(pk=request.user.pk)
        tool = get_object_or_404(RecoveryTool, pk=tool_id, user=request.user)
        serializer = RecoveryToolSerializer(tool, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)


class RecoveryCheckoffView(APIView):
    permission_classes = [IsAuthenticated]

    @transaction.atomic
    def put(self, request: Request, tool_id: str, performed_on: str) -> Response:
        User.objects.select_for_update().get(pk=request.user.pk)
        day = serializers.DateField().run_validation(performed_on)
        tool = get_object_or_404(
            RecoveryTool.objects.filter(Q(user=None) | Q(user=request.user)), pk=tool_id
        )
        if not tool.is_active:
            raise ValidationError("Archived tools cannot receive new check-offs.")
        entry, _ = RecoveryEntry.objects.get_or_create(
            user=request.user, tool=tool, performed_on=day
        )
        return Response(RecoveryEntrySerializer(entry).data)

    @transaction.atomic
    def delete(self, request: Request, tool_id: str, performed_on: str) -> Response:
        User.objects.select_for_update().get(pk=request.user.pk)
        day = serializers.DateField().run_validation(performed_on)
        get_object_or_404(
            RecoveryTool.objects.filter(Q(user=None) | Q(user=request.user)), pk=tool_id
        )
        RecoveryEntry.objects.filter(
            user=request.user, tool_id=tool_id, performed_on=day
        ).delete()
        return Response(status=204)
