from django.db.models import Q
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response

from apps.metrics.models import MetricDefinition
from apps.metrics.serializers import (
    MetricDefinitionSerializer,
    MetricEntrySerializer,
)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def metric_definition_list_view(request: Request) -> Response:
    definitions = MetricDefinition.objects.filter(
        Q(user__isnull=True) | Q(user=request.user),
        is_active=True,
    ).order_by("category", "name")

    serializer = MetricDefinitionSerializer(definitions, many=True)
    return Response(serializer.data)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def metric_entry_list_create_view(request: Request) -> Response:
    serializer = MetricEntrySerializer(
        data=request.data,
        context={"request": request},
    )
    serializer.is_valid(raise_exception=True)
    serializer.save()
    return Response(serializer.data, status=status.HTTP_201_CREATED)
