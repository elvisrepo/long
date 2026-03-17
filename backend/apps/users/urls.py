from django.urls import path

from apps.users.views import register_view

urlpatterns = [
    path("register/", register_view, name="auth-register"),
]

