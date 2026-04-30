from django.urls import path

from apps.metrics.views import metric_definition_list_view


urlpatterns = [
    path("definitions/", metric_definition_list_view, name="metric-definitions"),
]
