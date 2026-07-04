from django.urls import path

from apps.subscriptions.views import (
    CurrentSubscriptionView,
    StripeWebhookView,
    SubscriptionCheckoutView,
    SubscriptionPlanListView,
    SubscriptionPortalView,
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
        "portal/",
        SubscriptionPortalView.as_view(),
        name="subscription-portal",
    ),
    path(
        "stripe/webhook/",
        StripeWebhookView.as_view(),
        name="stripe-webhook",
    ),
]
