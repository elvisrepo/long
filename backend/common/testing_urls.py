from django.urls import path

from common.testing_views import reset_e2e_database_view


urlpatterns = [
    path("reset/", reset_e2e_database_view, name="testing-reset"),
]
