from django.urls import path

from apps.metrics.views import (
    ConsistencyAnalyticsView,
    MetricDefinitionDetailView,
    MetricDefinitionListView,
    MetricEntryDetailView,
    MetricEntryListCreateView,
    MetricUsageView,
    SleepInsightsView,
    SleepTargetPreferenceView,
    WeightStepsAnalyticsView,
)


urlpatterns = [
      path(
          "analytics/consistency/",
          ConsistencyAnalyticsView.as_view(),
          name="consistency-analytics",
      ),
      path(
          "analytics/sleep/",
          SleepInsightsView.as_view(),
          name="sleep-insights",
      ),
      path(
          "preferences/sleep/",
          SleepTargetPreferenceView.as_view(),
          name="sleep-target-preference",
      ),
      path(
          "analytics/weight-steps/",
          WeightStepsAnalyticsView.as_view(),
          name="weight-steps-analytics",
      ),
      path(
          "definitions/",
          MetricDefinitionListView.as_view(),
          name="metric-definitions",
      ),
      path(
          "entries/",
          MetricEntryListCreateView.as_view(),
          name="metric-entries",
      ),
      path(
      "entries/<int:pk>/",
      MetricEntryDetailView.as_view(),
      name="metric-entry-detail",
  ),
   path(
      "definitions/<uuid:pk>/",
      MetricDefinitionDetailView.as_view(),
      name="metric-definition-detail",
  ),
  path(
      "usage/",
      MetricUsageView.as_view(),
      name="metric-usage",
  ),
]
