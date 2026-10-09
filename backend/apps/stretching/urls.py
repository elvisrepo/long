from django.urls import path

from .views import StretchCheckoffView, StretchEntriesView, StretchExercisesView

urlpatterns = [
    path("exercises/", StretchExercisesView.as_view(), name="stretch-exercises"),
    path("entries/", StretchEntriesView.as_view(), name="stretch-entries"),
    path(
        "entries/<uuid:exercise_id>/<str:performed_on>/",
        StretchCheckoffView.as_view(),
        name="stretch-checkoff",
    ),
]
