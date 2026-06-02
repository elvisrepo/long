from django.urls import path

from apps.metrics.views import (
    MetricDefinitionDetailView,
    MetricDefinitionListView,
    MetricEntryDetailView,
    MetricEntryListCreateView,
)


urlpatterns = [
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
]