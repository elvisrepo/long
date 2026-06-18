from django.urls import path

from apps.subscriptions.views import (
    CurrentSubscriptionView,
    StripeWebhookView,
    SubscriptionCheckoutView,
    SubscriptionPlanListView,
)


urlpatterns = [
    path(
        "checkout/",
        SubscriptionCheckoutView.as_view(),
        name="subscription-checkout",
    ),
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
    path(
        "stripe/webhook/",
        StripeWebhookView.as_view(),
        name="stripe-webhook",
    ),
]
