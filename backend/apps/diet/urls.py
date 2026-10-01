from django.urls import path

from .views import (
    DietCatalogView,
    DietCheckoffView,
    DietEntriesView,
    DietFoodDetailView,
    DietFoodsView,
    DietSectionDetailView,
    DietSectionsView,
)

urlpatterns = [
    path("catalog/", DietCatalogView.as_view(), name="diet-catalog"),
    path("sections/", DietSectionsView.as_view(), name="diet-sections"),
    path(
        "sections/<uuid:section_id>/",
        DietSectionDetailView.as_view(),
        name="diet-section-detail",
    ),
    path("foods/", DietFoodsView.as_view(), name="diet-foods"),
    path(
        "foods/<uuid:food_id>/", DietFoodDetailView.as_view(), name="diet-food-detail"
    ),
    path("entries/", DietEntriesView.as_view(), name="diet-entries"),
    path(
        "entries/<uuid:food_id>/<str:performed_on>/",
        DietCheckoffView.as_view(),
        name="diet-checkoff",
    ),
]
