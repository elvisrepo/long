from django.urls import path

from apps.wearables.views import (
    WearableConnectionDetailView,
    WearableConnectionListView,
    WearableConnectionStatusView,
    WearableUploadView,
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
    path(
        "connections/<uuid:pk>/status/",
        WearableConnectionStatusView.as_view(),
        name="wearable-connection-status",
    ),
    path(
        "uploads/",
        WearableUploadView.as_view(),
        name="wearable-upload",
    ),
]
