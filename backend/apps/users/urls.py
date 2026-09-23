from django.urls import path

from apps.users.views import (
    csrf_view,
    me_view,
    mobile_login_view,
    mobile_logout_view,
    mobile_refresh_view,
    register_view,
    web_login_view,
    web_logout_view,
    web_refresh_view,
)

urlpatterns = [
    path("register/", register_view, name="auth-register"),
    path("mobile/login/", mobile_login_view, name="auth-mobile-login"),
    path("mobile/refresh/", mobile_refresh_view, name="auth-mobile-refresh"),
    path("mobile/logout/", mobile_logout_view, name="auth-mobile-logout"),
    path("me/", me_view, name="auth-me"),
    path("csrf/", csrf_view, name="auth-csrf"),
    path("web/login/", web_login_view, name="auth-web-login"),
    path("web/refresh/", web_refresh_view, name="auth-web-refresh"),
    path("web/logout/", web_logout_view, name="auth-web-logout"),
]
