"""
URL configuration for config project.

The `urlpatterns` list routes URLs to views. For more information please see:
    https://docs.djangoproject.com/en/6.0/topics/http/urls/
Examples:
Function views
    1. Add an import:  from my_app import views
    2. Add a URL to urlpatterns:  path('', views.home, name='home')
Class-based views
    1. Add an import:  from other_app.views import Home
    2. Add a URL to urlpatterns:  path('', Home.as_view(), name='home')
Including another URLconf
    1. Import the include() function: from django.urls import include, path
    2. Add a URL to urlpatterns:  path('blog/', include('blog.urls'))
"""
from django.contrib import admin
from django.conf import settings
from django.urls import include, path

from common.views import health_view, ping_task_view

urlpatterns = [
    path('admin/', admin.site.urls),
    path("health/", health_view, name="health"),
    path("tasks/ping/", ping_task_view, name="tasks-ping"),
    path("api/auth/", include("apps.users.urls")),
]

if getattr(settings, "ENABLE_E2E_TESTING_API", False):
    # Never mount destructive test helpers outside the dedicated E2E runtime.
    urlpatterns.append(path("api/testing/", include("common.testing_urls")))
