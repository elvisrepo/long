from django.urls import path

from rest_framework_simplejwt.views import TokenRefreshView
from apps.users.views import login_view,me_view, logout_view, refresh_view , web_refresh_view, csrf_view, register_view

urlpatterns = [
    path("register/", register_view, name="auth-register"),
    path("login/", login_view, name="auth-login"),
    path("refresh/", refresh_view , name="auth-refresh"),
    path("me/", me_view, name="auth-me"),
    path("logout/", logout_view, name="auth-logout"),
    path("csrf/", csrf_view, name="auth-csrf"),
    path("web/refresh/", web_refresh_view, name="auth-web-refresh"),
]

