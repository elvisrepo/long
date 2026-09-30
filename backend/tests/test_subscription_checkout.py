from unittest.mock import MagicMock, patch
from datetime import timedelta
from django.utils import timezone

import pytest
from django.conf import settings
from django.contrib.auth import get_user_model
from django.test import override_settings
from django.contrib.auth.models import AbstractBaseUser
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken
import stripe

from apps.subscriptions.models import (
    BillingCustomer,
    CheckoutAttempt,
    Subscription,
    SubscriptionPlan,
    SubscriptionPrice,
)

pytestmark = pytest.mark.django_db


def checkout_fixture() -> tuple[AbstractBaseUser, Subscription, SubscriptionPrice]:
    user = get_user_model().objects.create_user(
        email="repeat@example.com", password="strong-password-123"
    )
    current = Subscription.objects.create(
        user=user, plan=SubscriptionPlan.objects.get(code="free"), status="active"
    )
    plan = SubscriptionPlan.objects.create(
        code="repeat-pro",
        name="Pro",
        active_custom_metric_limit=10,
        wearable_connection_limit=2,
        sync_interval_minutes=15,
    )
    price = SubscriptionPrice.objects.create(
        plan=plan,
        provider="stripe",
        provider_price_id="price_repeat",
        currency="usd",
        unit_amount=1000,
        billing_interval="month",
    )
    return user, current, price


def test_repeated_checkout_reuses_open_session() -> None:
    from apps.subscriptions.services import create_checkout_session
    import stripe

    user, current, price = checkout_fixture()
    CheckoutAttempt.objects.create(
        user=user,
        price=price,
        expected_subscription=current,
        status="completed",
        provider_checkout_session_id="cs_open",
    )
    sdk = MagicMock()
    sdk.v1.checkout.sessions.retrieve.return_value = (
        stripe.checkout.Session.construct_from(
            {
                "id": "cs_open",
                "status": "open",
                "client_reference_id": str(user.pk),
                "url": "https://checkout.stripe.com/open",
            },
            key=None,
        )
    )
    with patch("apps.subscriptions.services._stripe_client", return_value=sdk):
        assert (
            create_checkout_session(user=user, price=price)
            == "https://checkout.stripe.com/open"
        )
    assert CheckoutAttempt.objects.filter(user=user).count() == 1
    sdk.v1.checkout.sessions.create.assert_not_called()


@pytest.mark.parametrize(
    "case", ["paid_local", "complete", "no_receipt", "remote_active"]
)
def test_duplicate_checkout_returns_conflict_without_creating_purchase(
    case: str,
) -> None:
    user, current, price = checkout_fixture()
    sdk = MagicMock()
    if case == "paid_local":
        current.plan = price.plan
        current.save(update_fields=["plan"])
    elif case in {"complete", "no_receipt"}:
        CheckoutAttempt.objects.create(
            user=user,
            price=price,
            expected_subscription=current,
            status="failed" if case == "no_receipt" else "completed",
            provider_checkout_session_id="" if case == "no_receipt" else "cs_paid",
        )
        sdk.v1.checkout.sessions.retrieve.return_value = (
            stripe.checkout.Session.construct_from(
                {
                    "id": "cs_paid",
                    "status": "complete",
                    "client_reference_id": str(user.pk),
                    "customer": "cus_paid",
                    "subscription": "sub_paid",
                },
                key=None,
            )
        )
        sdk.v1.subscriptions.retrieve.return_value = stripe.Subscription.construct_from(
            {"id": "sub_paid", "customer": "cus_paid", "status": "active"}, key=None
        )
    else:
        BillingCustomer.objects.create(
            user=user, provider="stripe", provider_customer_id="cus_paid"
        )
        sdk.v1.subscriptions.list.return_value.auto_paging_iter.return_value = iter(
            [
                stripe.Subscription.construct_from(
                    {"id": "sub_paid", "customer": "cus_paid", "status": "past_due"},
                    key=None,
                )
            ]
        )
    client = APIClient()
    client.force_authenticate(user=user)
    with patch("apps.subscriptions.services._stripe_client", return_value=sdk):
        response = client.post(
            "/api/v1/subscriptions/checkout/",
            {"price_id": str(price.pk)},
            format="json",
        )
    assert response.status_code == 409
    assert "detail" in response.json()
    sdk.v1.checkout.sessions.create.assert_not_called()
    sdk.v1.subscriptions.cancel.assert_not_called()


@pytest.mark.parametrize("previous_status", ["expired", "open"])
def test_replacement_checkout_requires_previous_link_closed(
    previous_status: str,
) -> None:
    from apps.subscriptions.services import create_checkout_session

    user, current, price = checkout_fixture()
    different_price = SubscriptionPrice.objects.create(
        plan=price.plan,
        provider="stripe",
        provider_price_id="price_year",
        currency="usd",
        unit_amount=10000,
        billing_interval="year",
    )
    attempt = CheckoutAttempt.objects.create(
        user=user,
        price=different_price,
        expected_subscription=current,
        status="completed",
        provider_checkout_session_id="cs_old",
    )
    sdk = MagicMock()
    sdk.v1.checkout.sessions.retrieve.return_value = (
        stripe.checkout.Session.construct_from(
            {
                "id": "cs_old",
                "status": previous_status,
                "client_reference_id": str(user.pk),
                "url": "https://checkout.stripe.com/old",
            },
            key=None,
        )
    )
    sdk.v1.checkout.sessions.expire.return_value = (
        stripe.checkout.Session.construct_from(
            {"id": "cs_old", "status": "expired"}, key=None
        )
    )

    def create(params: object, options: object) -> stripe.checkout.Session:
        attempt.refresh_from_db()
        assert attempt.status == "expired"
        return stripe.checkout.Session.construct_from(
            {"id": "cs_new", "url": "https://checkout.stripe.com/new"}, key=None
        )

    sdk.v1.checkout.sessions.create.side_effect = create
    with patch("apps.subscriptions.services._stripe_client", return_value=sdk):
        assert (
            create_checkout_session(user=user, price=price)
            == "https://checkout.stripe.com/new"
        )
    sdk.v1.checkout.sessions.create.assert_called_once()
    assert sdk.v1.checkout.sessions.expire.call_count == (
        1 if previous_status == "open" else 0
    )


def test_checkout_expiration_failure_never_creates_replacement() -> None:
    from apps.subscriptions.services import create_checkout_session

    user, current, price = checkout_fixture()
    CheckoutAttempt.objects.create(
        user=user,
        price=price,
        expected_subscription=current,
        status="completed",
        provider_checkout_session_id="cs_old",
    )
    sdk = MagicMock()
    sdk.v1.checkout.sessions.retrieve.return_value = (
        stripe.checkout.Session.construct_from(
            {
                "id": "cs_old",
                "status": "open",
                "client_reference_id": str(user.pk),
                "url": None,
            },
            key=None,
        )
    )
    sdk.v1.checkout.sessions.expire.return_value = (
        stripe.checkout.Session.construct_from(
            {"id": "cs_old", "status": "open"}, key=None
        )
    )
    with (
        patch("apps.subscriptions.services._stripe_client", return_value=sdk),
        pytest.raises(RuntimeError, match="expiration not confirmed"),
    ):
        create_checkout_session(user=user, price=price)
    sdk.v1.checkout.sessions.create.assert_not_called()


@pytest.mark.parametrize("old_status", ["confirmed", "completed"])
def test_missing_confirmed_checkout_allows_repurchase_after_customer_verification(
    old_status: str,
) -> None:
    from apps.subscriptions.services import create_checkout_session

    user, current, price = checkout_fixture()
    attempt = CheckoutAttempt.objects.create(
        user=user,
        price=price,
        expected_subscription=current,
        status=old_status,
        provider_checkout_session_id="cs_deleted",
    )
    CheckoutAttempt.objects.filter(pk=attempt.pk).update(
        created_at=timezone.now() - timedelta(days=91)
    )
    BillingCustomer.objects.create(
        user=user, provider="stripe", provider_customer_id="cus_old"
    )
    sdk = MagicMock()
    sdk.v1.checkout.sessions.retrieve.side_effect = stripe.InvalidRequestError(
        "No such checkout.session",
        param=None,
        code="resource_missing",
        http_status=404,
    )
    sdk.v1.subscriptions.list.return_value.auto_paging_iter.return_value = iter(
        [
            stripe.Subscription.construct_from(
                {"id": "sub_old", "customer": "cus_old", "status": "canceled"}, key=None
            )
        ]
    )
    sdk.v1.checkout.sessions.create.return_value = (
        stripe.checkout.Session.construct_from(
            {"id": "cs_new", "url": "https://checkout.stripe.com/new"},
            key=None,
        )
    )
    with patch("apps.subscriptions.services._stripe_client", return_value=sdk):
        assert (
            create_checkout_session(user=user, price=price)
            == "https://checkout.stripe.com/new"
        )
    attempt.refresh_from_db()
    assert attempt.status == "expired"
    sdk.v1.subscriptions.list.assert_called_once_with(
        {"customer": "cus_old", "status": "all", "limit": 100}
    )
    sdk.v1.checkout.sessions.create.assert_called_once()
    sdk.v1.checkout.sessions.expire.assert_not_called()


@pytest.mark.parametrize(
    "problem",
    [
        "active",
        "no_customer",
        "recent_completed",
        "failed",
        "unavailable",
        "wrong_customer",
        "other_404",
        "live_legacy",
    ],
)
def test_missing_checkout_does_not_bypass_billing_safety(problem: str) -> None:
    from apps.subscriptions.services import CheckoutConflict, create_checkout_session

    user, current, price = checkout_fixture()
    attempt = CheckoutAttempt.objects.create(
        user=user,
        price=price,
        expected_subscription=current,
        status="completed"
        if problem in {"recent_completed", "live_legacy"}
        else "failed"
        if problem == "failed"
        else "confirmed",
        provider_checkout_session_id="cs_deleted",
    )
    if problem == "live_legacy":
        CheckoutAttempt.objects.filter(pk=attempt.pk).update(
            created_at=timezone.now() - timedelta(days=91)
        )
    if problem != "no_customer":
        BillingCustomer.objects.create(
            user=user, provider="stripe", provider_customer_id="cus_old"
        )
    sdk = MagicMock()
    sdk.v1.checkout.sessions.retrieve.side_effect = stripe.InvalidRequestError(
        "Missing",
        param=None,
        code="resource_missing" if problem != "other_404" else "different_error",
        http_status=404,
    )
    sdk.v1.subscriptions.list.return_value.auto_paging_iter.return_value = iter(
        [
            stripe.Subscription.construct_from(
                {
                    "id": "sub_old",
                    "customer": "cus_other"
                    if problem == "wrong_customer"
                    else "cus_old",
                    "status": "active" if problem == "active" else "canceled",
                },
                key=None,
            )
        ]
    )
    if problem == "unavailable":
        sdk.v1.subscriptions.list.side_effect = stripe.APIConnectionError("Unavailable")
    with (
        override_settings(
            STRIPE_SECRET_KEY="sk_live_fake"
            if problem == "live_legacy"
            else "sk_test_fake"
        ),
        patch("apps.subscriptions.services._stripe_client", return_value=sdk),
    ):
        with pytest.raises((CheckoutConflict, stripe.StripeError, RuntimeError)):
            create_checkout_session(user=user, price=price)
    attempt.refresh_from_db()
    assert attempt.status != "expired"
    sdk.v1.checkout.sessions.create.assert_not_called()


def test_cancelled_subscription_allows_a_new_checkout() -> None:
    from apps.subscriptions.services import create_checkout_session

    user, current, price = checkout_fixture()
    CheckoutAttempt.objects.create(
        user=user,
        price=price,
        expected_subscription=current,
        status="confirmed",
        provider_checkout_session_id="cs_cancelled",
    )
    sdk = MagicMock()
    sdk.v1.checkout.sessions.retrieve.return_value = (
        stripe.checkout.Session.construct_from(
            {
                "id": "cs_cancelled",
                "client_reference_id": str(user.pk),
                "status": "complete",
                "customer": "cus_old",
                "subscription": "sub_old",
            },
            key=None,
        )
    )
    sdk.v1.subscriptions.retrieve.return_value = stripe.Subscription.construct_from(
        {"id": "sub_old", "customer": "cus_old", "status": "canceled"}, key=None
    )
    sdk.v1.checkout.sessions.create.return_value = (
        stripe.checkout.Session.construct_from(
            {"id": "cs_new", "url": "https://checkout.stripe.com/new"}, key=None
        )
    )
    with patch("apps.subscriptions.services._stripe_client", return_value=sdk):
        assert (
            create_checkout_session(user=user, price=price)
            == "https://checkout.stripe.com/new"
        )
    sdk.v1.checkout.sessions.create.assert_called_once()


@pytest.mark.parametrize("problem", ["wrong_owner", "provider_failure"])
def test_unverified_previous_checkout_blocks_new_purchase(problem: str) -> None:
    from apps.subscriptions.services import create_checkout_session

    user, current, price = checkout_fixture()
    CheckoutAttempt.objects.create(
        user=user,
        price=price,
        expected_subscription=current,
        status="completed",
        provider_checkout_session_id="cs_old",
    )
    sdk = MagicMock()
    if problem == "provider_failure":
        sdk.v1.checkout.sessions.retrieve.side_effect = RuntimeError(
            "Stripe unavailable"
        )
    else:
        sdk.v1.checkout.sessions.retrieve.return_value = (
            stripe.checkout.Session.construct_from(
                {
                    "id": "cs_old",
                    "client_reference_id": "another-owner",
                    "status": "open",
                    "url": "https://checkout.stripe.com/old",
                },
                key=None,
            )
        )
    with (
        patch("apps.subscriptions.services._stripe_client", return_value=sdk),
        pytest.raises(RuntimeError),
    ):
        create_checkout_session(user=user, price=price)
    sdk.v1.checkout.sessions.create.assert_not_called()
    sdk.v1.checkout.sessions.expire.assert_not_called()


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
def test_create_checkout_session_fails_before_client_or_attempt_write() -> None:
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
    assert attempt.provider_checkout_session_id == "cs_test_missing_url"


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
