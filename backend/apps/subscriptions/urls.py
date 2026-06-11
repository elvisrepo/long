from django.urls import path

from apps.subscriptions.views import (
      CurrentSubscriptionView,
      SubscriptionPlanListView,
  )


urlpatterns = [
    path(
        "current/",
        CurrentSubscriptionView.as_view(),
        name="current-subscription",
    ),
      path(
      "plans/",
      SubscriptionPlanListView.as_view(),
      name="subscription-plans",
  ),
]
