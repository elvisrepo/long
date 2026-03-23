from django.urls import path

from apps.users.views import (
    csrf_view,
    login_view,
    logout_view,
    me_view,
    refresh_view,
    register_view,
    web_logout_view,
    web_refresh_view,
)

urlpatterns = [
    path("register/", register_view, name="auth-register"),
    path("login/", login_view, name="auth-login"),
    path("refresh/", refresh_view, name="auth-refresh"),
    path("mobile/refresh/", refresh_view, name="auth-mobile-refresh"),
    path("mobile/logout/", logout_view, name="auth-mobile-logout"),
    path("me/", me_view, name="auth-me"),
    path("logout/", logout_view, name="auth-logout"),
    path("csrf/", csrf_view, name="auth-csrf"),
    path("web/refresh/", web_refresh_view, name="auth-web-refresh"),
    path("web/logout/", web_logout_view, name="auth-web-logout"),
]

