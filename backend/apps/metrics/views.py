from django.db.models import Q
from rest_framework import generics
from rest_framework.permissions import IsAuthenticated

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
          queryset = (
              MetricEntry.objects.filter(user=self.request.user)
              .select_related("metric_definition")
              .order_by("-recorded_at", "-id")
          )

          metric_slug = self.request.query_params.get("metric")
          if metric_slug:
              queryset = queryset.filter(metric_definition__slug=metric_slug)

          recorded_from = self.request.query_params.get("from")
          if recorded_from:
                # only keep MetricEntry rows where recorded_at >= recorded_from
                queryset = queryset.filter(recorded_at__gte=recorded_from)

          recorded_to = self.request.query_params.get("to")
          if recorded_to:
                queryset = queryset.filter(recorded_at__lte=recorded_to)

          return queryset



'''
GET /api/v1/metrics/entries/?to=2026-03-05T23:59:59Z

  becomes SQL roughly like:

  WHERE recorded_at <= '2026-03-05T23:59:59Z'

  This keeps entries recorded on or before that time.

  
  these filters are cumulative. If you apply both:

  queryset = queryset.filter(recorded_at__gte=recorded_from)
  queryset = queryset.filter(recorded_at__lte=recorded_to)

  Django combines them as:

  WHERE recorded_at >= from_value
    AND recorded_at <= to_value

  So together they create a date/time range.
'''