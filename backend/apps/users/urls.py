from django.urls import path

from rest_framework_simplejwt.views import TokenRefreshView
from apps.users.views import login_view, register_view

urlpatterns = [
    path("register/", register_view, name="auth-register"),
    path("login/", login_view, name="auth-login"),
    path("refresh/", TokenRefreshView.as_view(), name="auth-refresh"),
]

