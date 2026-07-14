from django.urls import path

from apps.wearables.views import WearableConnectionListView


urlpatterns = [
    path(
        "connections/",
        WearableConnectionListView.as_view(),
        name="wearable-connection-list",
    ),
]
