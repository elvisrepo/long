from django.urls import path

from . import views
from . import routine_views

urlpatterns = [
    path(
        "sessions/<uuid:workout_id>/groups/",
        views.SessionGroupsView.as_view(),
        name="workout-session-groups",
    ),
    path(
        "routine-days/<uuid:day_id>/exercises/",
        routine_views.RoutineExercisesView.as_view(),
        name="workout-routine-exercises",
    ),
    path(
        "routine-exercises/<uuid:item_id>/",
        routine_views.RoutineExerciseDetailView.as_view(),
        name="workout-routine-exercise-detail",
    ),
    path(
        "routine-exercises/<uuid:item_id>/sets/",
        routine_views.RoutineSetsView.as_view(),
        name="workout-routine-sets",
    ),
    path(
        "routine-sets/<uuid:set_id>/",
        routine_views.RoutineSetDetailView.as_view(),
        name="workout-routine-set-detail",
    ),
    path(
        "routines/<uuid:routine_id>/days/",
        routine_views.RoutineDaysView.as_view(),
        name="workout-routine-days",
    ),
    path(
        "routine-days/<uuid:day_id>/",
        routine_views.RoutineDayDetailView.as_view(),
        name="workout-routine-day-detail",
    ),
    path(
        "routine-days/<uuid:day_id>/start/",
        routine_views.StartRoutineDayView.as_view(),
        name="workout-routine-day-start",
    ),
    path("routines/", routine_views.RoutinesView.as_view(), name="workout-routines"),
    path(
        "routines/<uuid:routine_id>/",
        routine_views.RoutineDetailView.as_view(),
        name="workout-routine-detail",
    ),
    path(
        "session-exercises/<uuid:item_id>/sets/",
        views.SetsView.as_view(),
        name="workout-sets",
    ),
    path(
        "sets/<uuid:set_id>/", views.SetDetailView.as_view(), name="workout-set-detail"
    ),
    path("sessions/", views.SessionsView.as_view(), name="workout-sessions"),
    path(
        "sessions/<uuid:workout_id>/",
        views.SessionDetailView.as_view(),
        name="workout-session-detail",
    ),
    path(
        "sessions/<uuid:workout_id>/exercises/",
        views.SessionExercisesView.as_view(),
        name="workout-session-exercises",
    ),
    path(
        "sessions/<uuid:workout_id>/copy/",
        views.CopyView.as_view(),
        name="workout-copy",
    ),
    path(
        "session-exercises/<uuid:item_id>/",
        views.SessionExerciseDetailView.as_view(),
        name="workout-session-exercise-detail",
    ),
    path("catalog/", views.CatalogView.as_view(), name="workout-catalog"),
    path(
        "catalog/initialize/",
        views.InitializeCatalogView.as_view(),
        name="workout-catalog-initialize",
    ),
    path("categories/", views.CategoriesView.as_view(), name="workout-categories"),
    path(
        "categories/<uuid:category_id>/",
        views.CategoryDetailView.as_view(),
        name="workout-category-detail",
    ),
    path("exercises/", views.ExercisesView.as_view(), name="workout-exercises"),
    path(
        "exercises/<uuid:exercise_id>/",
        views.ExerciseDetailView.as_view(),
        name="workout-exercise-detail",
    ),
]
