from django.urls import path

from apps.subscriptions.views import CurrentSubscriptionView


urlpatterns = [
    path(
        "current/",
        CurrentSubscriptionView.as_view(),
        name="current-subscription",
    ),
]
