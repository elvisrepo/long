import csv
import json
from collections.abc import Iterable
from datetime import UTC, date, datetime, timedelta
from typing import NotRequired, TypedDict, cast
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from django.db.models import Aggregate, F, FloatField, Max, Min, Q, QuerySet, Sum, Value, CharField
from django.db.models.functions import TruncDate
from django.db.models.fields.json import KeyTextTransform
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
from apps.metrics.source_precedence import preferred_metric_source

from rest_framework.response import Response
from rest_framework.views import APIView

from apps.metrics.limits import get_active_custom_metric_usage
from apps.subscriptions.services import get_current_subscription_plan

DEFAULT_METRIC_ENTRY_LIMIT = 50
DEFAULT_DAILY_STEPS_LIMIT = 30
MAX_DAILY_STEPS_LIMIT = 366
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


class Median(Aggregate):
    """PostgreSQL continuous median for grouped numeric metric values."""

    function = "PERCENTILE_CONT"
    template = "%(function)s(0.5) WITHIN GROUP (ORDER BY %(expressions)s)"
    output_field = FloatField()
    window_compatible = False


class DailyMetricSummary(TypedDict):
    id: object
    local_date: date
    source: str
    source_package_name: str | None
    aggregation: NotRequired[str]
    value: float
    period_start: NotRequired[datetime | None]
    recorded_at: datetime | None
    created_at: datetime | None


def daily_metric_summaries(
    *,
    entries: QuerySet[MetricEntry],
    timezone: ZoneInfo,
    limit: int,
    value_aggregate: Aggregate,
    include_period_start: bool,
    local_date_from: date | None = None,
    local_date_to: date | None = None,
) -> list[DailyMetricSummary]:
    """Aggregate one preferred source per local day without mixing providers."""

    annotated_entries = entries.annotate(
        local_date=TruncDate("recorded_at", tzinfo=timezone),
        source_package_name=KeyTextTransform("source_package_name", "context"),
    )
    if local_date_from is not None:
        annotated_entries = annotated_entries.filter(
            local_date__gte=local_date_from
        )
    if local_date_to is not None:
        annotated_entries = annotated_entries.filter(
            local_date__lte=local_date_to
        )
    latest_dates = (
        annotated_entries.values("local_date").distinct()
        .order_by("-local_date")[:limit]
    )
    source_days = annotated_entries.filter(local_date__in=latest_dates).values(
        "local_date", "source", "source_package_name"
    ).distinct()
    sources_by_date: dict[date, list[tuple[str, str | None]]] = {}
    for source_day in source_days:
        sources_by_date.setdefault(source_day["local_date"], []).append(
            (source_day["source"], source_day["source_package_name"])
        )

    chosen_sources: dict[date, tuple[str, str | None]] = {}
    for local_date, origins in sources_by_date.items():
        source = preferred_metric_source(origin[0] for origin in origins)
        # Deterministic conservative fallback until users can choose a source.
        chosen_sources[local_date] = min(
            (origin for origin in origins if origin[0] == source),
            key=lambda origin: origin[1] or "",
        )
    if not chosen_sources:
        return []

    chosen_filter = Q(pk__in=[])
    for local_date, (source, package) in chosen_sources.items():
        origin_filter = (
            Q(source_package_name__isnull=True) if package is None
            else Q(source_package_name=package)
        )
        chosen_filter |= Q(local_date=local_date, source=source) & origin_filter

    annotations: dict[str, object] = {
        "id": Max("id"),
        "value": value_aggregate,
        "recorded_at": Max("recorded_at"),
        "created_at": Max("created_at"),
    }
    if include_period_start:
        annotations["period_start"] = Min("period_start")

    return cast(
        list[DailyMetricSummary],
        list(
            annotated_entries.filter(chosen_filter)
            .values("local_date", "source", "source_package_name")
            .annotate(**annotations)
            .order_by("-local_date")
        ),
    )


def health_connect_activity_summaries(
    *,
    entries: QuerySet[MetricEntry],
    timezone: ZoneInfo,
    limit: int,
    value_aggregate: Aggregate,
    include_period_start: bool,
    local_date_from: date | None = None,
    local_date_to: date | None = None,
) -> list[DailyMetricSummary]:
    """Use platform-prioritized buckets, never an arbitrary raw Health Connect app."""
    snapshots = entries.filter(
        source=MetricEntry.Source.HEALTH_CONNECT,
        context__aggregation="health_connect",
        context__has_data=True,
    ).annotate(
        # Aggregate intervals have an exclusive end; midnight closes yesterday.
        local_date=TruncDate(
            F("recorded_at") - timedelta(microseconds=1), tzinfo=timezone
        ),
    )
    if local_date_from is not None:
        snapshots = snapshots.filter(local_date__gte=local_date_from)
    if local_date_to is not None:
        snapshots = snapshots.filter(local_date__lte=local_date_to)
    rows = list(
        snapshots.values("local_date", "source")
        .annotate(
            id=Max("id"),
            value=Sum("value"),
            period_start=Min("period_start"),
            recorded_at=Max("recorded_at"),
            created_at=Max("created_at"),
            source_package_name=Value(None, output_field=CharField()),
        )
        .order_by("-local_date")[:limit]
    )
    by_date: dict[date, DailyMetricSummary] = {
        row["local_date"]: cast(
            DailyMetricSummary, {**row, "aggregation": "health_connect_daily"}
        )
        for row in rows
    }
    # Retain manual/CSV/legacy data on dates without a platform total. Raw
    # multi-origin Health Connect records are history, never summed as a proxy.
    fallback = daily_metric_summaries(
        entries=entries.exclude(source=MetricEntry.Source.HEALTH_CONNECT),
        timezone=timezone,
        limit=limit,
        value_aggregate=value_aggregate,
        include_period_start=include_period_start,
        local_date_from=local_date_from,
        local_date_to=local_date_to,
    )
    for row in fallback:
        by_date.setdefault(row["local_date"], row)
    return cast(
        list[DailyMetricSummary],
        [by_date[day] for day in sorted(by_date, reverse=True)[:limit]],
    )


def parse_local_date_bound(
    value: str | None,
    *,
    field_name: str,
    timezone: ZoneInfo,
) -> date | None:
    if value is None:
        return None

    parsed = parse_datetime(value)
    if parsed is None:
        raise ValidationError(
            {field_name: ["Enter a valid ISO-8601 timestamp."]}
        )
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone)
    return parsed.astimezone(timezone).date()


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
              .exclude(metric_definition__is_default=True, metric_definition__is_active=False)
              .filter(Q(context__aggregation__isnull=True) | ~Q(context__aggregation="health_connect"))
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


class DailySumSummaryView(APIView):
    """Return a system metric's preferred-origin sum per local date."""

    permission_classes = [IsAuthenticated]
    metric_slug: str
    summary_function = staticmethod(daily_metric_summaries)

    def get(self, request: Request) -> Response:
        timezone_name = request.query_params.get("timezone", "UTC")
        try:
            timezone = ZoneInfo(timezone_name)
        except (ZoneInfoNotFoundError, ValueError) as exc:
            raise ValidationError(
                {"timezone": ["Enter a valid IANA timezone."]}
            ) from exc

        limit = (
            parse_positive_int(request.query_params.get("limit"))
            or DEFAULT_DAILY_STEPS_LIMIT
        )
        if limit > MAX_DAILY_STEPS_LIMIT:
            raise ValidationError(
                {"limit": [f"Limit cannot exceed {MAX_DAILY_STEPS_LIMIT}."]}
            )

        entries = MetricEntry.objects.filter(
            user=request.user,
            metric_definition__slug=self.metric_slug,
            metric_definition__user__isnull=True,
            metric_definition__is_default=True,
            metric_definition__is_active=True,
        )
        local_date_from = parse_local_date_bound(
            request.query_params.get("from"),
            field_name="from",
            timezone=timezone,
        )
        local_date_to = parse_local_date_bound(
            request.query_params.get("to"),
            field_name="to",
            timezone=timezone,
        )

        summaries = self.summary_function(
            entries=entries,
            timezone=timezone,
            limit=limit,
            value_aggregate=Sum("value"),
            include_period_start=True,
            local_date_from=local_date_from,
            local_date_to=local_date_to,
        )

        return Response(
            [
                {
                    "id": summary["id"],
                    "metric_definition": self.metric_slug,
                    "value": float(summary["value"]),
                    "local_date": summary["local_date"].isoformat(),
                    "period_start": format_export_timestamp(
                        summary["period_start"]
                    ),
                    "recorded_at": format_export_timestamp(
                        summary["recorded_at"]
                    ),
                    "source": summary["source"],
                    "context": {
                        "aggregation": summary.get("aggregation", "daily"),
                        **({"source_package_name": summary["source_package_name"]}
                           if summary["source_package_name"] else {}),
                    },
                    "created_at": format_export_timestamp(
                        summary["created_at"]
                    ),
                }
                for summary in summaries
            ]
        )


class DailyStepsSummaryView(DailySumSummaryView):
    metric_slug = "steps"


class DailyHealthConnectActivitySummaryView(DailySumSummaryView):
    summary_function = staticmethod(health_connect_activity_summaries)


class DailyDistanceSummaryView(DailyHealthConnectActivitySummaryView):
    """Daily kilometres from platform-prioritized activity snapshots."""

    metric_slug = "distance"


class DailyTotalCaloriesSummaryView(DailyHealthConnectActivitySummaryView):
    """Daily total energy, including resting metabolism, in kcal."""

    metric_slug = "total_calories_burned"


class DailyMedianSummaryView(APIView):
    """Return one preferred-source median per metric and local date."""

    permission_classes = [IsAuthenticated]
    metric_slug = "hrv"

    def get(self, request: Request) -> Response:
        timezone_name = request.query_params.get("timezone", "UTC")
        try:
            timezone = ZoneInfo(timezone_name)
        except (ZoneInfoNotFoundError, ValueError) as exc:
            raise ValidationError(
                {"timezone": ["Enter a valid IANA timezone."]}
            ) from exc

        limit = (
            parse_positive_int(request.query_params.get("limit"))
            or DEFAULT_DAILY_STEPS_LIMIT
        )
        if limit > MAX_DAILY_STEPS_LIMIT:
            raise ValidationError(
                {"limit": [f"Limit cannot exceed {MAX_DAILY_STEPS_LIMIT}."]}
            )

        entries = MetricEntry.objects.filter(
            user=request.user,
            metric_definition__slug=self.metric_slug,
            metric_definition__user__isnull=True,
            metric_definition__is_default=True,
            metric_definition__is_active=True,
        )
        local_date_from = parse_local_date_bound(
            request.query_params.get("from"),
            field_name="from",
            timezone=timezone,
        )
        local_date_to = parse_local_date_bound(
            request.query_params.get("to"),
            field_name="to",
            timezone=timezone,
        )

        summaries = daily_metric_summaries(
            entries=entries,
            timezone=timezone,
            limit=limit,
            value_aggregate=Median("value"),
            include_period_start=False,
            local_date_from=local_date_from,
            local_date_to=local_date_to,
        )

        return Response(
            [
                {
                    "id": summary["id"],
                    "metric_definition": self.metric_slug,
                    "value": summary["value"],
                    "local_date": summary["local_date"].isoformat(),
                    "period_start": None,
                    "recorded_at": format_export_timestamp(
                        summary["recorded_at"]
                    ),
                    "source": summary["source"],
                    "context": {"aggregation": "daily_median"},
                    "created_at": format_export_timestamp(
                        summary["created_at"]
                    ),
                }
                for summary in summaries
            ]
        )


class DailyHrvSummaryView(DailyMedianSummaryView):
    metric_slug = "hrv"


class DailyRespiratoryRateSummaryView(DailyMedianSummaryView):
    metric_slug = "respiratory_rate"


class DailySkinTemperatureSummaryView(DailyMedianSummaryView):
    metric_slug = "skin_temperature"


class MetricEntryCsvExportView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request: Request) -> StreamingHttpResponse:
        plan = get_current_subscription_plan(request.user)
        if plan.csv_export_enabled is False:
            raise PermissionDenied("Pro CSV export is required.")

        entries = (
            MetricEntry.objects.filter(user=request.user)
            .filter(Q(context__aggregation__isnull=True) | ~Q(context__aggregation="health_connect"))
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
            'attachment; filename="syncvitals-metrics.csv"'
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
