from django.urls import path

from apps.wearables.views import (
    WearableConnectionDetailView,
    WearableConnectionListView,
)


urlpatterns = [
    path(
        "connections/",
        WearableConnectionListView.as_view(),
        name="wearable-connection-list",
    ),
    path(
        "connections/<uuid:pk>/",
        WearableConnectionDetailView.as_view(),
        name="wearable-connection-detail",
    ),
]
