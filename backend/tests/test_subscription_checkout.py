from unittest.mock import patch

import pytest
from django.conf import settings
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from apps.subscriptions.models import SubscriptionPlan, SubscriptionPrice

pytestmark = pytest.mark.django_db


def test_subscription_checkout_requires_authentication():
    response = APIClient().post(
        "/api/v1/subscriptions/checkout/",
        {"price_id": "00000000-0000-0000-0000-000000000000"},
        format="json",
    )

    assert response.status_code == 401


def test_subscription_checkout_requires_price_id():
    user = get_user_model().objects.create_user(
        email="alice@example.com",
        password="strong-password-123",
    )
    client = APIClient()
    access_token = RefreshToken.for_user(user).access_token
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {access_token}")

    response = client.post(
        "/api/v1/subscriptions/checkout/",
        {},
        format="json",
    )

    assert response.status_code == 400
    assert response.json() == {
        "price_id": ["This field is required."],
    }


def test_subscription_checkout_rejects_inactive_price():
    user = get_user_model().objects.create_user(
        email="alice@example.com",
        password="strong-password-123",
    )
    client = APIClient()
    access_token = RefreshToken.for_user(user).access_token
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {access_token}")

    plan = SubscriptionPlan.objects.create(
        code="pro-checkout",
        name="Pro",
        active_custom_metric_limit=10,
        wearable_connection_limit=2,
        sync_interval_minutes=15,
    )

    inactive_price = SubscriptionPrice.objects.create(
        plan=plan,
        provider=SubscriptionPrice.Provider.STRIPE,
        provider_price_id="price_inactive",
        currency="usd",
        unit_amount=1000,
        billing_interval=SubscriptionPrice.BillingInterval.MONTH,
        is_active=False,
    )

    response = client.post(
        "/api/v1/subscriptions/checkout/",
        {"price_id": str(inactive_price.id)},
        format="json",
    )

    assert response.status_code == 400
    assert "price_id" in response.json()


def test_subscription_checkout_creates_stripe_checkout_session_for_active_price():
    user = get_user_model().objects.create_user(
        email="alice@example.com",
        password="strong-password-123",
    )
    client = APIClient()
    access_token = RefreshToken.for_user(user).access_token
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {access_token}")

    plan = SubscriptionPlan.objects.create(
        code="pro-checkout-success",
        name="Pro",
        active_custom_metric_limit=10,
        wearable_connection_limit=2,
        sync_interval_minutes=15,
    )
    price = SubscriptionPrice.objects.create(
        plan=plan,
        provider=SubscriptionPrice.Provider.STRIPE,
        provider_price_id="price_stripe_pro_monthly",
        currency="usd",
        unit_amount=1000,
        billing_interval=SubscriptionPrice.BillingInterval.MONTH,
        is_active=True,
    )

    with patch(
        "apps.subscriptions.views.create_checkout_session",
        return_value="https://checkout.stripe.com/c/test-session",
    ) as create_checkout_session:
        response = client.post(
            "/api/v1/subscriptions/checkout/",
            {"price_id": str(price.id)},
            format="json",
        )

    assert response.status_code == 201
    assert response.json() == {
        "url": "https://checkout.stripe.com/c/test-session",
    }
    create_checkout_session.assert_called_once_with(
        user=user,
        price=price,
    )

#  This test replaces the real Stripe SDK client with a mock, so the test does not call Stripe.
def test_create_checkout_session_uses_stripe_subscription_mode():
    from apps.subscriptions.services import create_checkout_session

    user = get_user_model().objects.create_user(
        email="alice@example.com",
        password="strong-password-123",
    )
    plan = SubscriptionPlan.objects.create(
        code="pro-checkout-service",
        name="Pro",
        active_custom_metric_limit=10,
        wearable_connection_limit=2,
        sync_interval_minutes=15,
    )
    price = SubscriptionPrice.objects.create(
        plan=plan,
        provider=SubscriptionPrice.Provider.STRIPE,
        provider_price_id="price_stripe_pro_monthly",
        currency="usd",
        unit_amount=1000,
        billing_interval=SubscriptionPrice.BillingInterval.MONTH,
        is_active=True,
    )
    # This temporarily replaces StripeClient inside apps.subscriptions.services.
    with patch("apps.subscriptions.services.StripeClient") as stripe_client:
        checkout_session = stripe_client.return_value.v1.checkout.sessions.create
        checkout_session.return_value.url = "https://checkout.stripe.com/c/test-session"

        checkout_url = create_checkout_session(user=user, price=price)

    assert checkout_url == "https://checkout.stripe.com/c/test-session"
    stripe_client.assert_called_once_with(settings.STRIPE_SECRET_KEY)
    checkout_session.assert_called_once_with(
        {
            "line_items": [
                {
                    "price": "price_stripe_pro_monthly",
                    "quantity": 1,
                },
            ],
            "mode": "subscription",
            "success_url": settings.STRIPE_CHECKOUT_SUCCESS_URL,
            "cancel_url": settings.STRIPE_CHECKOUT_CANCEL_URL,
            "client_reference_id": str(user.id),
            "customer_email": user.email,
            "metadata": {
                "user_id": str(user.id),
                "subscription_price_id": str(price.id),
                "subscription_plan_id": str(plan.id),
            },
        }
    )




'''

with patch("apps.subscriptions.services.StripeClient") as stripe_client:

  This temporarily replaces StripeClient inside apps.subscriptions.services.

  So when production code does:

  client = StripeClient(settings.STRIPE_SECRET_KEY)

  it actually calls the mock instead.

  checkout_session = stripe_client.return_value.v1.checkout.sessions.create

  stripe_client.return_value means “the fake object returned when StripeClient(...) is called”.

  Then this reaches the mocked nested method:

  client.v1.checkout.sessions.create

  So checkout_session is the fake version of Stripe’s create() method.

  checkout_session.return_value.url = "https://checkout.stripe.com/c/test-session"

  This configures the fake create() call to return an object with a .url value.

  So when our service runs:

  session = client.v1.checkout.sessions.create({...})
  return session.url

  the returned value becomes:

  "https://checkout.stripe.com/c/test-session"

  In short:

  Real StripeClient -> replaced by mock
  Real Stripe API call -> replaced by fake create()
  Fake create() returns object with .url
  Service returns that URL
  Test verifies the exact Stripe payload
'''