import csv
import json
from collections.abc import Iterable
from datetime import UTC, datetime

from django.db.models import Q
from django.http import StreamingHttpResponse
from django.utils.dateparse import parse_datetime
from rest_framework import generics
from rest_framework.exceptions import APIException
from rest_framework.permissions import IsAuthenticated
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.request import Request

from apps.metrics.analytics import (
    get_consistency_analytics,
    get_sleep_insights,
    get_weight_steps_analytics,
)
from apps.metrics.models import MetricDefinition, MetricEntry
from apps.metrics.serializers import (
      MetricDefinitionSerializer,
      MetricEntrySerializer,
      SleepTargetPreferenceSerializer,
  )

from rest_framework.response import Response
from rest_framework.views import APIView

from apps.metrics.limits import get_active_custom_metric_usage
from apps.subscriptions.services import get_current_subscription_plan

DEFAULT_METRIC_ENTRY_LIMIT = 50
METRIC_EXPORT_COLUMNS = (
    "entry_id",
    "metric_slug",
    "metric_name",
    "value",
    "unit",
    "period_start",
    "recorded_at",
    "source",
    "context",
    "created_at",
)


class CsvEcho:
    """Give csv.writer the file-like interface needed for streamed rows."""

    def write(self, value: str) -> str:
        return value


def format_export_timestamp(value: datetime | None) -> str:
    if value is None:
        return ""

    return value.isoformat().replace("+00:00", "Z")


def parse_export_datetime(value: str, field_name: str) -> datetime:
    parsed_value = parse_datetime(value)
    if parsed_value is None:
        raise ValidationError({field_name: ["Enter a valid date/time."]})

    if parsed_value.tzinfo is None:
        return parsed_value.replace(tzinfo=UTC)

    return parsed_value


def escape_spreadsheet_formula(value: str) -> str:
    if value.lstrip().startswith(("=", "+", "-", "@")):
        return f"'{value}"

    return value


def iter_metric_export_rows(entries: Iterable[MetricEntry]) -> Iterable[str]:
    writer = csv.writer(CsvEcho())
    yield writer.writerow(METRIC_EXPORT_COLUMNS)

    for entry in entries:
        yield writer.writerow(
            (
                entry.id,
                entry.metric_definition.slug,
                escape_spreadsheet_formula(entry.metric_definition.name),
                entry.value,
                escape_spreadsheet_formula(entry.metric_definition.unit),
                format_export_timestamp(entry.period_start),
                format_export_timestamp(entry.recorded_at),
                entry.source,
                json.dumps(entry.context, ensure_ascii=False, sort_keys=True),
                format_export_timestamp(entry.created_at),
            )
        )


class SyncedMetricEntryMutationError(APIException):
      status_code = 409
      default_detail = "Synced metric entries cannot be edited or deleted."
      default_code = "synced_metric_entry_immutable"

class MetricDefinitionListView(generics.ListCreateAPIView):
    serializer_class = MetricDefinitionSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
          include_inactive = (
              self.request.query_params.get("include_inactive") == "true"
          )

          if include_inactive:
              return MetricDefinition.objects.filter(
                  Q(user__isnull=True, is_active=True)
                  | Q(user=self.request.user)
              ).order_by("category", "name")

          return MetricDefinition.objects.filter(
              Q(user__isnull=True) | Q(user=self.request.user),
              is_active=True,
          ).order_by("category", "name")
    
class MetricDefinitionDetailView(generics.RetrieveUpdateAPIView):
      serializer_class = MetricDefinitionSerializer
      permission_classes = [IsAuthenticated]

      def get_queryset(self):
          return MetricDefinition.objects.filter(
              user=self.request.user,
              is_default=False,
          )
    


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

          limit = parse_positive_int(self.request.query_params.get("limit"))
          queryset = queryset[: limit or DEFAULT_METRIC_ENTRY_LIMIT]

          '''
            WHERE user = current_user
            AND metric_definition.slug = 'resting_hr'
            AND recorded_at >= '...'
            ORDER BY recorded_at DESC, id DESC
            LIMIT 50
          '''

          return queryset


class MetricEntryCsvExportView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request: Request) -> StreamingHttpResponse:
        entries = (
            MetricEntry.objects.filter(user=request.user)
            .select_related("metric_definition")
            .order_by("recorded_at", "id")
        )
        metric_slug = request.query_params.get("metric")
        if metric_slug:
            entries = entries.filter(metric_definition__slug=metric_slug)

        recorded_from = request.query_params.get("from")
        if recorded_from:
            entries = entries.filter(
                recorded_at__gte=parse_export_datetime(recorded_from, "from")
            )

        recorded_to = request.query_params.get("to")
        if recorded_to:
            entries = entries.filter(
                recorded_at__lte=parse_export_datetime(recorded_to, "to")
            )

        response = StreamingHttpResponse(
            iter_metric_export_rows(entries.iterator(chunk_size=1000)),
            content_type="text/csv; charset=utf-8",
        )
        response["Content-Disposition"] = (
            'attachment; filename="longevity-metrics.csv"'
        )
        return response


class MetricEntryDetailView(generics.RetrieveUpdateDestroyAPIView):
      serializer_class = MetricEntrySerializer
      permission_classes = [IsAuthenticated]

      def get_queryset(self):
          return (
              MetricEntry.objects.filter(user=self.request.user)
              .select_related("metric_definition")
              .order_by("-recorded_at", "-id")
          )

      def perform_update(self, serializer: MetricEntrySerializer) -> None:
          entry = serializer.instance
          if entry is not None and not entry.is_user_editable:
              raise SyncedMetricEntryMutationError

          serializer.save()

      def perform_destroy(self, instance: MetricEntry) -> None:
          if not instance.is_user_editable:
              raise SyncedMetricEntryMutationError

          instance.delete()


def parse_positive_int(value: str | None) -> int | None:
      if value is None:
          return None

      try:
          parsed_value = int(value)
      except ValueError as exc:
          raise ValidationError(
              {"limit": ["Limit must be a positive integer."]}
          ) from exc

      if parsed_value < 1:
          raise ValidationError(
              {"limit": ["Limit must be a positive integer."]}
          )

      return parsed_value

class MetricUsageView(APIView):
      permission_classes = [IsAuthenticated]

      def get(self, request):
          return Response(
              {
                  "active_custom_metrics": get_active_custom_metric_usage(
                      request.user
                  )
              }
          )


class WeightStepsAnalyticsView(APIView):
      permission_classes = [IsAuthenticated]

      def get(self, request):
          plan = get_current_subscription_plan(request.user)
          if plan.analytics_enabled is False:
              raise PermissionDenied("Pro analytics are required.")

          return Response(
              get_weight_steps_analytics(
                  user=request.user,
                  days=parse_analytics_days(
                      request.query_params.get("days", "30")
                  ),
              )
          )


class ConsistencyAnalyticsView(APIView):
      permission_classes = [IsAuthenticated]

      def get(self, request):
          plan = get_current_subscription_plan(request.user)
          if plan.analytics_enabled is False:
              raise PermissionDenied("Pro analytics are required.")

          return Response(get_consistency_analytics(user=request.user))


class SleepInsightsView(APIView):
      permission_classes = [IsAuthenticated]

      def get(self, request):
          plan = get_current_subscription_plan(request.user)
          if plan.analytics_enabled is False:
              raise PermissionDenied("Pro analytics are required.")

          return Response(
              get_sleep_insights(
                  user=request.user,
                  target_minutes=parse_sleep_target_minutes(
                      request.query_params.get("target_minutes")
                      or str(request.user.sleep_target_minutes)
                  ),
              )
          )


class SleepTargetPreferenceView(APIView):
      permission_classes = [IsAuthenticated]

      def get(self, request):
          return Response(
              {"target_minutes": request.user.sleep_target_minutes}
          )

      def patch(self, request):
          serializer = SleepTargetPreferenceSerializer(data=request.data)
          serializer.is_valid(raise_exception=True)
          request.user.sleep_target_minutes = serializer.validated_data[
              "target_minutes"
          ]
          request.user.save(update_fields=["sleep_target_minutes"])
          return Response(
              {"target_minutes": request.user.sleep_target_minutes}
          )


def parse_analytics_days(value: str) -> int:
      try:
          days = int(value)
      except ValueError as exc:
          raise ValidationError(
              {"days": ["Choose one of 7, 30, or 90 days."]}
          ) from exc

      if days not in (7, 30, 90):
          raise ValidationError(
              {"days": ["Choose one of 7, 30, or 90 days."]}
          )

      return days


def parse_sleep_target_minutes(value: str) -> int:
      try:
          target_minutes = int(value)
      except ValueError as exc:
          raise ValidationError(
              {"target_minutes": ["Choose a whole number from 60 to 1439."]}
          ) from exc

      if not 60 <= target_minutes <= 1439:
          raise ValidationError(
              {"target_minutes": ["Choose a whole number from 60 to 1439."]}
          )

      return target_minutes
      
# APIView fits here because this endpoint returns calculated usage data, not model CRUD
# handled by a generic model view.


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
