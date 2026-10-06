from django.urls import path

from .views import (
    RecoveryCheckoffView,
    RecoveryEntriesView,
    RecoveryToolDetailView,
    RecoveryToolsView,
)

urlpatterns = [
    path("tools/", RecoveryToolsView.as_view(), name="recovery-tools"),
    path(
        "tools/<uuid:tool_id>/",
        RecoveryToolDetailView.as_view(),
        name="recovery-tool-detail",
    ),
    path("entries/", RecoveryEntriesView.as_view(), name="recovery-entries"),
    path(
        "entries/<uuid:tool_id>/<str:performed_on>/",
        RecoveryCheckoffView.as_view(),
        name="recovery-checkoff",
    ),
]
