from django.urls import path

from apps.metrics.views import (
    metric_definition_list_view,
    metric_entry_list_create_view,
)


urlpatterns = [
    path("definitions/", metric_definition_list_view, name="metric-definitions"),
    path("entries/", metric_entry_list_create_view, name="metric-entries"),
]
