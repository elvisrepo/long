from django.urls import path

from .views import (
    StretchCheckoffView,
    CustomStretchExerciseDetailView,
    CustomStretchExerciseImageView,
    StretchEntriesView,
    StretchExercisesView,
    StretchPreferencesView,
)

urlpatterns = [
    path("exercises/", StretchExercisesView.as_view(), name="stretch-exercises"),
    path(
        "exercises/<uuid:exercise_id>/image/",
        CustomStretchExerciseImageView.as_view(),
        name="stretch-exercise-image",
    ),
    path(
        "exercises/<uuid:exercise_id>/",
        CustomStretchExerciseDetailView.as_view(),
        name="stretch-exercise-detail",
    ),
    path("preferences/", StretchPreferencesView.as_view(), name="stretch-preferences"),
    path("entries/", StretchEntriesView.as_view(), name="stretch-entries"),
    path(
        "entries/<uuid:exercise_id>/<str:performed_on>/",
        StretchCheckoffView.as_view(),
        name="stretch-checkoff",
    ),
]
