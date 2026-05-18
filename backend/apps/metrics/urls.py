from django.urls import path

from apps.metrics.views import (
    MetricDefinitionListView,
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
]