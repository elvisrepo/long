from django.db.models import Q
from rest_framework import generics
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request

from apps.metrics.models import MetricDefinition, MetricEntry
from apps.metrics.serializers import (
      MetricDefinitionSerializer,
      MetricEntrySerializer,
  )



class MetricDefinitionListView(generics.ListAPIView):
    serializer_class = MetricDefinitionSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
          return MetricDefinition.objects.filter(
              Q(user__isnull=True) | Q(user=self.request.user),
              is_active=True,
          ).order_by("category", "name")
    


class MetricEntryListCreateView(generics.ListCreateAPIView):
      serializer_class = MetricEntrySerializer
      permission_classes = [IsAuthenticated]

      def get_queryset(self):
          return (
              MetricEntry.objects.filter(user=self.request.user)
              .select_related("metric_definition")
              .order_by("-recorded_at", "-id")
          )