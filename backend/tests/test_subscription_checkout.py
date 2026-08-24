from unittest.mock import patch

import pytest
from django.conf import settings
from django.contrib.auth import get_user_model
from django.test import override_settings
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from apps.subscriptions.models import (
    BillingCustomer,
    CheckoutAttempt,
    Subscription,
    SubscriptionPlan,
    SubscriptionPrice,
)

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

    free_plan = SubscriptionPlan.objects.get(code="free")
    Subscription.objects.create(
        user=user,
        plan=free_plan,
        status=Subscription.Status.ACTIVE,
    )
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

def test_create_checkout_session_uses_checkout_attempt_as_idempotency_key():
    from apps.subscriptions.services import create_checkout_session

    user = get_user_model().objects.create_user(
        email="alice@example.com",
        password="strong-password-123",
    )
    free_plan = SubscriptionPlan.objects.get(code="free")
    Subscription.objects.create(
        user=user,
        plan=free_plan,
        status=Subscription.Status.ACTIVE,
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
        checkout_session.return_value.id = "cs_test_checkout_session"
        checkout_session.return_value.url = "https://checkout.stripe.com/c/test-session"

        checkout_url = create_checkout_session(user=user, price=price)

    attempt = CheckoutAttempt.objects.get(user=user, price=price)

    assert checkout_url == "https://checkout.stripe.com/c/test-session"
    assert attempt.status == CheckoutAttempt.Status.COMPLETED
    assert attempt.provider_checkout_session_id == "cs_test_checkout_session"
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
                "checkout_attempt_id": str(attempt.id),
                "subscription_price_id": str(price.id),
                "subscription_plan_id": str(plan.id),
            },
        },
        options={
            "idempotency_key": str(attempt.id),
        },
    )


@override_settings(STRIPE_OUTBOUND_API_ENABLED=False)
def test_create_checkout_session_fails_before_client_or_attempt_write(
) -> None:
    from apps.subscriptions.services import create_checkout_session

    user = get_user_model().objects.create_user(
        email="e2e-disabled-checkout@example.com",
        password="strong-password-123",
    )
    free_plan = SubscriptionPlan.objects.get(code="free")
    Subscription.objects.create(
        user=user,
        plan=free_plan,
        status=Subscription.Status.ACTIVE,
    )
    paid_plan = SubscriptionPlan.objects.create(
        code="e2e-disabled-checkout",
        name="Pro",
        active_custom_metric_limit=10,
        wearable_connection_limit=2,
        sync_interval_minutes=15,
    )
    price = SubscriptionPrice.objects.create(
        plan=paid_plan,
        provider=SubscriptionPrice.Provider.STRIPE,
        provider_price_id="price_e2e_disabled",
        currency="usd",
        unit_amount=1000,
        billing_interval=SubscriptionPrice.BillingInterval.MONTH,
        is_active=True,
    )

    with patch("apps.subscriptions.services.StripeClient") as stripe_client:
        with pytest.raises(RuntimeError, match="outbound API is disabled"):
            create_checkout_session(user=user, price=price)

    stripe_client.assert_not_called()
    assert not CheckoutAttempt.objects.filter(user=user, price=price).exists()


def test_create_checkout_session_stores_expected_subscription():
    from apps.subscriptions.services import create_checkout_session

    user = get_user_model().objects.create_user(
        email="expected-subscription-checkout@example.com",
        password="strong-password-123",
    )
    free_plan = SubscriptionPlan.objects.get(code="free")
    current_subscription = Subscription.objects.create(
        user=user,
        plan=free_plan,
        status=Subscription.Status.ACTIVE,
    )
    plan = SubscriptionPlan.objects.create(
        code="pro-checkout-expected-subscription",
        name="Pro",
        active_custom_metric_limit=10,
        wearable_connection_limit=2,
        sync_interval_minutes=15,
    )
    price = SubscriptionPrice.objects.create(
        plan=plan,
        provider=SubscriptionPrice.Provider.STRIPE,
        provider_price_id="price_stripe_expected_subscription",
        currency="usd",
        unit_amount=1000,
        billing_interval=SubscriptionPrice.BillingInterval.MONTH,
        is_active=True,
    )

    with patch("apps.subscriptions.services.StripeClient") as stripe_client:
        checkout_session = stripe_client.return_value.v1.checkout.sessions.create
        checkout_session.return_value.id = "cs_test_expected_subscription"
        checkout_session.return_value.url = "https://checkout.stripe.com/c/test-session"

        create_checkout_session(user=user, price=price)

    attempt = CheckoutAttempt.objects.get(user=user, price=price)

    assert attempt.expected_subscription == current_subscription


def test_subscription_checkout_returns_bad_gateway_when_stripe_fails():
    user = get_user_model().objects.create_user(
        email="alice@example.com",
        password="strong-password-123",
    )
    client = APIClient()
    access_token = RefreshToken.for_user(user).access_token
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {access_token}")

    free_plan = SubscriptionPlan.objects.get(code="free")
    Subscription.objects.create(
        user=user,
        plan=free_plan,
        status=Subscription.Status.ACTIVE,
    )
    plan = SubscriptionPlan.objects.create(
        code="pro-checkout-stripe-failure",
        name="Pro",
        active_custom_metric_limit=10,
        wearable_connection_limit=2,
        sync_interval_minutes=15,
    )
    price = SubscriptionPrice.objects.create(
        plan=plan,
        provider=SubscriptionPrice.Provider.STRIPE,
        provider_price_id="price_stripe_failure",
        currency="usd",
        unit_amount=1000,
        billing_interval=SubscriptionPrice.BillingInterval.MONTH,
        is_active=True,
    )

    with patch(
        "apps.subscriptions.views.create_checkout_session",
        side_effect=RuntimeError("stripe is unavailable"),
    ):
        response = client.post(
            "/api/v1/subscriptions/checkout/",
            {"price_id": str(price.id)},
            format="json",
        )

    assert response.status_code == 502
    assert response.json() == {
        "detail": "Unable to create checkout session.",
    }


def test_subscription_checkout_rejects_default_plan_price():
    user = get_user_model().objects.create_user(
        email="alice@example.com",
        password="strong-password-123",
    )
    client = APIClient()
    access_token = RefreshToken.for_user(user).access_token
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {access_token}")

    free_plan = SubscriptionPlan.objects.get(code="free")
    price = SubscriptionPrice.objects.create(
        plan=free_plan,
        provider=SubscriptionPrice.Provider.STRIPE,
        provider_price_id="price_free_should_not_checkout",
        currency="usd",
        unit_amount=100,
        billing_interval=SubscriptionPrice.BillingInterval.MONTH,
        is_active=True,
    )

    response = client.post(
        "/api/v1/subscriptions/checkout/",
        {"price_id": str(price.id)},
        format="json",
    )

    assert response.status_code == 400
    assert "price_id" in response.json()


def test_subscription_checkout_rejects_current_subscription_price():
    user = get_user_model().objects.create_user(
        email="alice@example.com",
        password="strong-password-123",
    )
    client = APIClient()
    access_token = RefreshToken.for_user(user).access_token
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {access_token}")

    plan = SubscriptionPlan.objects.create(
        code="pro-checkout-current-price",
        name="Pro",
        active_custom_metric_limit=10,
        wearable_connection_limit=2,
        sync_interval_minutes=15,
    )
    price = SubscriptionPrice.objects.create(
        plan=plan,
        provider=SubscriptionPrice.Provider.STRIPE,
        provider_price_id="price_current_subscription",
        currency="usd",
        unit_amount=1000,
        billing_interval=SubscriptionPrice.BillingInterval.MONTH,
        is_active=True,
    )

    Subscription.objects.create(
        user=user,
        plan=plan,
        price=price,
        status=Subscription.Status.ACTIVE,
    )

    with patch("apps.subscriptions.views.create_checkout_session") as create_checkout:
        response = client.post(
            "/api/v1/subscriptions/checkout/",
            {"price_id": str(price.id)},
            format="json",
        )

    assert response.status_code == 400
    assert response.json() == {
        "price_id": ["You are already subscribed to this price."],
    }
    create_checkout.assert_not_called()


def test_subscription_checkout_rejects_new_checkout_for_active_stripe_subscription():
    user = get_user_model().objects.create_user(
        email="active-stripe-subscription@example.com",
        password="strong-password-123",
    )
    client = APIClient()
    access_token = RefreshToken.for_user(user).access_token
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {access_token}")

    plan = SubscriptionPlan.objects.create(
        code="pro-active-stripe-checkout",
        name="Pro",
        active_custom_metric_limit=10,
        wearable_connection_limit=2,
        sync_interval_minutes=15,
    )
    monthly_price = SubscriptionPrice.objects.create(
        plan=plan,
        provider=SubscriptionPrice.Provider.STRIPE,
        provider_price_id="price_active_stripe_monthly",
        currency="usd",
        unit_amount=1000,
        billing_interval=SubscriptionPrice.BillingInterval.MONTH,
    )
    yearly_price = SubscriptionPrice.objects.create(
        plan=plan,
        provider=SubscriptionPrice.Provider.STRIPE,
        provider_price_id="price_active_stripe_yearly",
        currency="usd",
        unit_amount=10000,
        billing_interval=SubscriptionPrice.BillingInterval.YEAR,
    )
    Subscription.objects.create(
        user=user,
        plan=plan,
        price=monthly_price,
        status=Subscription.Status.ACTIVE,
        provider=SubscriptionPrice.Provider.STRIPE,
        provider_subscription_id="sub_active_stripe",
    )

    with patch(
        "apps.subscriptions.views.create_checkout_session",
        return_value="https://checkout.stripe.com/c/test-session",
    ) as create_checkout:
        response = client.post(
            "/api/v1/subscriptions/checkout/",
            {"price_id": str(yearly_price.id)},
            format="json",
        )

    assert response.status_code == 400
    assert response.json() == {
        "detail": [
            "Manage changes to an active Stripe subscription through the billing portal."
        ],
    }
    create_checkout.assert_not_called()


def test_subscription_checkout_requires_current_subscription():
    user = get_user_model().objects.create_user(
        email="alice@example.com",
        password="strong-password-123",
    )
    client = APIClient()
    access_token = RefreshToken.for_user(user).access_token
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {access_token}")

    plan = SubscriptionPlan.objects.create(
        code="pro-checkout-no-current-subscription",
        name="Pro",
        active_custom_metric_limit=10,
        wearable_connection_limit=2,
        sync_interval_minutes=15,
    )
    price = SubscriptionPrice.objects.create(
        plan=plan,
        provider=SubscriptionPrice.Provider.STRIPE,
        provider_price_id="price_no_current_subscription",
        currency="usd",
        unit_amount=1000,
        billing_interval=SubscriptionPrice.BillingInterval.MONTH,
        is_active=True,
    )

    with patch("apps.subscriptions.views.create_checkout_session") as create_checkout:
        response = client.post(
            "/api/v1/subscriptions/checkout/",
            {"price_id": str(price.id)},
            format="json",
        )

    assert response.status_code == 400
    assert response.json() == {
        "detail": ["A current subscription is required before checkout."],
    }
    create_checkout.assert_not_called()


def test_create_checkout_session_marks_attempt_failed_when_stripe_fails():
    from apps.subscriptions.services import create_checkout_session

    user = get_user_model().objects.create_user(
        email="checkout-failure@example.com",
        password="strong-password-123",
    )
    free_plan = SubscriptionPlan.objects.get(code="free")
    Subscription.objects.create(
        user=user,
        plan=free_plan,
        status=Subscription.Status.ACTIVE,
    )
    plan = SubscriptionPlan.objects.create(
        code="pro-checkout-service-failure",
        name="Pro",
        active_custom_metric_limit=10,
        wearable_connection_limit=2,
        sync_interval_minutes=15,
    )
    price = SubscriptionPrice.objects.create(
        plan=plan,
        provider=SubscriptionPrice.Provider.STRIPE,
        provider_price_id="price_stripe_failure_service",
        currency="usd",
        unit_amount=1000,
        billing_interval=SubscriptionPrice.BillingInterval.MONTH,
        is_active=True,
    )

    with patch("apps.subscriptions.services.StripeClient") as stripe_client:
        checkout_session = stripe_client.return_value.v1.checkout.sessions.create
        checkout_session.side_effect = RuntimeError("stripe is unavailable")

        with pytest.raises(RuntimeError, match="stripe is unavailable"):
            create_checkout_session(user=user, price=price)

    attempt = CheckoutAttempt.objects.get(user=user, price=price)

    assert attempt.status == CheckoutAttempt.Status.FAILED
    assert attempt.provider_checkout_session_id == ""


def test_create_checkout_session_rejects_missing_redirect_url():
    from apps.subscriptions.services import create_checkout_session

    user = get_user_model().objects.create_user(
        email="checkout-missing-url@example.com",
        password="strong-password-123",
    )
    free_plan = SubscriptionPlan.objects.get(code="free")
    Subscription.objects.create(
        user=user,
        plan=free_plan,
        status=Subscription.Status.ACTIVE,
    )
    plan = SubscriptionPlan.objects.create(
        code="pro-checkout-missing-url",
        name="Pro",
        active_custom_metric_limit=10,
        wearable_connection_limit=2,
        sync_interval_minutes=15,
    )
    price = SubscriptionPrice.objects.create(
        plan=plan,
        provider=SubscriptionPrice.Provider.STRIPE,
        provider_price_id="price_stripe_missing_url",
        currency="usd",
        unit_amount=1000,
        billing_interval=SubscriptionPrice.BillingInterval.MONTH,
        is_active=True,
    )

    with patch("apps.subscriptions.services.StripeClient") as stripe_client:
        checkout_session = stripe_client.return_value.v1.checkout.sessions.create
        checkout_session.return_value.id = "cs_test_missing_url"
        checkout_session.return_value.url = None

        with pytest.raises(
            ValueError,
            match="Stripe Checkout Session did not include a redirect URL.",
        ):
            create_checkout_session(user=user, price=price)

    attempt = CheckoutAttempt.objects.get(user=user, price=price)

    assert attempt.status == CheckoutAttempt.Status.FAILED
    assert attempt.provider_checkout_session_id == ""


def test_create_checkout_session_reuses_existing_billing_customer():
    from apps.subscriptions.services import create_checkout_session

    user = get_user_model().objects.create_user(
        email="existing-customer@example.com",
        password="strong-password-123",
    )
    free_plan = SubscriptionPlan.objects.get(code="free")
    Subscription.objects.create(
        user=user,
        plan=free_plan,
        status=Subscription.Status.ACTIVE,
    )
    BillingCustomer.objects.create(
        user=user,
        provider=BillingCustomer.Provider.STRIPE,
        provider_customer_id="cus_existing_123",
    )
    plan = SubscriptionPlan.objects.create(
        code="pro-checkout-existing-customer",
        name="Pro",
        active_custom_metric_limit=10,
        wearable_connection_limit=2,
        sync_interval_minutes=15,
    )
    price = SubscriptionPrice.objects.create(
        plan=plan,
        provider=SubscriptionPrice.Provider.STRIPE,
        provider_price_id="price_existing_customer",
        currency="usd",
        unit_amount=1000,
        billing_interval=SubscriptionPrice.BillingInterval.MONTH,
        is_active=True,
    )

    with patch("apps.subscriptions.services.StripeClient") as stripe_client:
        checkout_session = stripe_client.return_value.v1.checkout.sessions.create
        checkout_session.return_value.id = "cs_existing_customer"
        checkout_session.return_value.url = "https://checkout.stripe.com/c/test-session"

        create_checkout_session(user=user, price=price)

    attempt = CheckoutAttempt.objects.get(user=user, price=price)

    checkout_session.assert_called_once_with(
        {
            "line_items": [
                {
                    "price": "price_existing_customer",
                    "quantity": 1,
                },
            ],
            "mode": "subscription",
            "success_url": settings.STRIPE_CHECKOUT_SUCCESS_URL,
            "cancel_url": settings.STRIPE_CHECKOUT_CANCEL_URL,
            "client_reference_id": str(user.id),
            "customer": "cus_existing_123",
            "metadata": {
                "user_id": str(user.id),
                "checkout_attempt_id": str(attempt.id),
                "subscription_price_id": str(price.id),
                "subscription_plan_id": str(plan.id),
            },
        },
        options={
            "idempotency_key": str(attempt.id),
        },
    )
