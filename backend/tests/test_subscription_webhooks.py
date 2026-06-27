from uuid import uuid4
from unittest.mock import patch

import pytest
from django.conf import settings
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from apps.subscriptions.models import (
    CheckoutAttempt,
    StripeWebhookEvent,
    Subscription,
    SubscriptionPlan,
    SubscriptionPrice,
)
from apps.subscriptions.services import process_stripe_webhook_event

pytestmark = pytest.mark.django_db


def test_stripe_webhook_rejects_missing_signature():
    client = APIClient()

    response = client.post(
        "/api/v1/subscriptions/stripe/webhook/",
        data=b'{"type": "checkout.session.completed"}',
        content_type="application/json",
    )

    assert response.status_code == 400
    assert response.json() == {
        "detail": "Invalid Stripe webhook signature.",
    }


def test_stripe_webhook_rejects_invalid_signature():
    client = APIClient()

    with patch(
        "apps.subscriptions.views.verify_stripe_webhook_event",
        side_effect=ValueError("invalid signature"),
    ) as verify_event:
        response = client.post(
            "/api/v1/subscriptions/stripe/webhook/",
            data=b'{"type": "checkout.session.completed"}',
            content_type="application/json",
            HTTP_STRIPE_SIGNATURE="invalid-signature",
        )

    assert response.status_code == 400
    assert response.json() == {
        "detail": "Invalid Stripe webhook signature.",
    }
    verify_event.assert_called_once_with(
        payload=b'{"type": "checkout.session.completed"}',
        signature="invalid-signature",
        webhook_secret=settings.STRIPE_WEBHOOK_SECRET,
    )


def test_stripe_webhook_processes_valid_event():
    client = APIClient()
    event = {
        "id": "evt_test_valid",
        "type": "customer.subscription.updated",
    }

    with (
        patch(
            "apps.subscriptions.views.verify_stripe_webhook_event",
            return_value=event,
        ) as verify_event,
        patch("apps.subscriptions.views.process_stripe_webhook_event") as process_event,
    ):
        response = client.post(
            "/api/v1/subscriptions/stripe/webhook/",
            data=b'{"id": "evt_test_valid"}',
            content_type="application/json",
            HTTP_STRIPE_SIGNATURE="valid-signature",
        )

    assert response.status_code == 200
    assert response.json() == {"received": True}
    verify_event.assert_called_once_with(
        payload=b'{"id": "evt_test_valid"}',
        signature="valid-signature",
        webhook_secret=settings.STRIPE_WEBHOOK_SECRET,
    )
    process_event.assert_called_once_with(event)


def test_stripe_webhook_duplicate_delivery_returns_success_once_already_processed():
    client = APIClient()
    event = {
        "id": "evt_duplicate_endpoint",
        "type": "customer.subscription.updated",
    }

    #  duplicate delivery is simulated by pre-creating
    # the webhook event row before making the HTTP request
    StripeWebhookEvent.objects.create(
        provider_event_id="evt_duplicate_endpoint",
        event_type="customer.subscription.updated",
    )
    # sends the same event ID again through the endpoint
    with patch(
        "apps.subscriptions.views.verify_stripe_webhook_event",
        return_value=event,
    ) as verify_event:
        response = client.post(
            "/api/v1/subscriptions/stripe/webhook/",
            data=b'{"id": "evt_duplicate_endpoint"}',
            content_type="application/json",
            HTTP_STRIPE_SIGNATURE="valid-signature",
        )

    assert response.status_code == 200
    assert response.json() == {"received": True}
    assert StripeWebhookEvent.objects.filter(
        provider_event_id="evt_duplicate_endpoint",
    ).count() == 1
    verify_event.assert_called_once_with(
        payload=b'{"id": "evt_duplicate_endpoint"}',
        signature="valid-signature",
        webhook_secret=settings.STRIPE_WEBHOOK_SECRET,
    )


def test_checkout_session_completed_confirms_attempt_and_changes_subscription():
    user = get_user_model().objects.create_user(
        email="paid@example.com",
        password="strong-password-123",
    )
    free_plan = SubscriptionPlan.objects.get(code="free")
    free_subscription = Subscription.objects.create(
        user=user,
        plan=free_plan,
        status=Subscription.Status.ACTIVE,
    )
    pro_plan = SubscriptionPlan.objects.create(
        code="pro-webhook",
        name="Pro",
        active_custom_metric_limit=10,
        wearable_connection_limit=2,
        sync_interval_minutes=15,
    )
    pro_price = SubscriptionPrice.objects.create(
        plan=pro_plan,
        provider=SubscriptionPrice.Provider.STRIPE,
        provider_price_id="price_pro_webhook",
        currency="usd",
        unit_amount=1000,
        billing_interval=SubscriptionPrice.BillingInterval.MONTH,
    )
    attempt = CheckoutAttempt.objects.create(
        user=user,
        price=pro_price,
        expected_subscription=free_subscription,
        status=CheckoutAttempt.Status.COMPLETED,
        provider_checkout_session_id="cs_test_paid",
    )
    event = {
        "id": "evt_checkout_completed",
        "type": "checkout.session.completed",
        "data": {
            "object": {
                "id": "cs_test_paid",
                "metadata": {
                    "checkout_attempt_id": str(attempt.id),
                    "subscription_price_id": str(pro_price.id),
                    "subscription_plan_id": str(pro_plan.id),
                    "user_id": str(user.id),
                },
            },
        },
    }

    process_stripe_webhook_event(event)

    attempt.refresh_from_db()
    free_subscription.refresh_from_db()
    current_subscription = Subscription.objects.get(
        user=user,
        status=Subscription.Status.ACTIVE,
    )

    assert attempt.status == CheckoutAttempt.Status.CONFIRMED
    assert free_subscription.status == Subscription.Status.CANCELLED
    assert current_subscription.plan == pro_plan
    assert current_subscription.price == pro_price

# processing the same Stripe event twice does not apply the subscription upgrade twice.
def test_checkout_session_completed_is_idempotent_for_duplicate_event():
    user = get_user_model().objects.create_user(
        email="duplicate-webhook@example.com",
        password="strong-password-123",
    )
    free_plan = SubscriptionPlan.objects.get(code="free")
    # user starts on free sub
    free_subscription = Subscription.objects.create(
        user=user,
        plan=free_plan,
        status=Subscription.Status.ACTIVE,
    )
    pro_plan = SubscriptionPlan.objects.create(
        code="pro-duplicate-webhook",
        name="Pro",
        active_custom_metric_limit=10,
        wearable_connection_limit=2,
        sync_interval_minutes=15,
    )
    pro_price = SubscriptionPrice.objects.create(
        plan=pro_plan,
        provider=SubscriptionPrice.Provider.STRIPE,
        provider_price_id="price_pro_duplicate_webhook",
        currency="usd",
        unit_amount=1000,
        billing_interval=SubscriptionPrice.BillingInterval.MONTH,
    )
    attempt = CheckoutAttempt.objects.create(
        user=user,
        price=pro_price,
        expected_subscription=free_subscription,
        status=CheckoutAttempt.Status.COMPLETED,
        provider_checkout_session_id="cs_test_duplicate_paid",
    )

    #fake stripe event arrives
    event = {
        "id": "evt_checkout_duplicate",
        "type": "checkout.session.completed",
        "data": {
            "object": {
                "id": "cs_test_duplicate_paid",
                "metadata": {
                    "checkout_attempt_id": str(attempt.id),
                    "subscription_price_id": str(pro_price.id),
                    "subscription_plan_id": str(pro_plan.id),
                    "user_id": str(user.id),
                },
            },
        },
    }

    process_stripe_webhook_event(event)
    process_stripe_webhook_event(event)

    # we have old cancelled free sub, and new active pro sub
    assert Subscription.objects.filter(user=user).count() == 2
    assert Subscription.objects.get(
        user=user,
        status=Subscription.Status.ACTIVE,
    ).plan == pro_plan


def test_checkout_session_completed_with_missing_metadata_is_ignored_safely():
    user = get_user_model().objects.create_user(
        email="missing-metadata-webhook@example.com",
        password="strong-password-123",
    )
    free_plan = SubscriptionPlan.objects.get(code="free")
    Subscription.objects.create(
        user=user,
        plan=free_plan,
        status=Subscription.Status.ACTIVE,
    )

    event = {
        "id": "evt_checkout_missing_metadata",
        "type": "checkout.session.completed",
        "data": {
            "object": {
                "id": "cs_test_missing_metadata",
                "metadata": {},
            },
        },
    }

    process_stripe_webhook_event(event)

    assert StripeWebhookEvent.objects.filter(
        provider_event_id="evt_checkout_missing_metadata",
    ).exists()
    assert Subscription.objects.get(
        user=user,
        status=Subscription.Status.ACTIVE,
    ).plan == free_plan
    assert Subscription.objects.filter(user=user).count() == 1


def test_checkout_session_completed_with_mismatched_session_id_is_ignored_safely():
    user = get_user_model().objects.create_user(
        email="mismatched-session-webhook@example.com",
        password="strong-password-123",
    )
    free_plan = SubscriptionPlan.objects.get(code="free")
    free_subscription = Subscription.objects.create(
        user=user,
        plan=free_plan,
        status=Subscription.Status.ACTIVE,
    )

    pro_plan = SubscriptionPlan.objects.create(
        code="pro-mismatched-session-webhook",
        name="Pro",
        active_custom_metric_limit=10,
        wearable_connection_limit=2,
        sync_interval_minutes=15,
    )
    pro_price = SubscriptionPrice.objects.create(
        plan=pro_plan,
        provider=SubscriptionPrice.Provider.STRIPE,
        provider_price_id="price_pro_mismatched_session_webhook",
        currency="usd",
        unit_amount=1000,
        billing_interval=SubscriptionPrice.BillingInterval.MONTH,
    )

    attempt = CheckoutAttempt.objects.create(
        user=user,
        price=pro_price,
        expected_subscription=free_subscription,
        status=CheckoutAttempt.Status.COMPLETED,
        provider_checkout_session_id="cs_test_real_session",
    )

    event = {
        "id": "evt_checkout_mismatched_session",
        "type": "checkout.session.completed",
        "data": {
            "object": {
                "id": "cs_test_wrong_session",
                "metadata": {
                    "checkout_attempt_id": str(attempt.id),
                    "subscription_price_id": str(pro_price.id),
                    "subscription_plan_id": str(pro_plan.id),
                    "user_id": str(user.id),
                },
            },
        },
    }

    process_stripe_webhook_event(event)

    attempt.refresh_from_db()

    assert StripeWebhookEvent.objects.filter(
        provider_event_id="evt_checkout_mismatched_session",
    ).exists()
    assert attempt.status == CheckoutAttempt.Status.COMPLETED
    assert Subscription.objects.get(
        user=user,
        status=Subscription.Status.ACTIVE,
    ).plan == free_plan
    assert Subscription.objects.filter(user=user).count() == 1


def test_checkout_session_completed_with_price_plan_mismatch_is_ignored_safely():
    user = get_user_model().objects.create_user(
        email="price-plan-mismatch-webhook@example.com",
        password="strong-password-123",
    )
    free_plan = SubscriptionPlan.objects.get(code="free")
    free_subscription = Subscription.objects.create(
        user=user,
        plan=free_plan,
        status=Subscription.Status.ACTIVE,
    )
    pro_plan = SubscriptionPlan.objects.create(
        code="pro-price-plan-mismatch-webhook",
        name="Pro",
        active_custom_metric_limit=10,
        wearable_connection_limit=2,
        sync_interval_minutes=15,
    )
    premium_plan = SubscriptionPlan.objects.create(
        code="premium-price-plan-mismatch-webhook",
        name="Premium",
        active_custom_metric_limit=25,
        wearable_connection_limit=5,
        sync_interval_minutes=5,
    )
    premium_price = SubscriptionPrice.objects.create(
        plan=premium_plan,
        provider=SubscriptionPrice.Provider.STRIPE,
        provider_price_id="price_premium_mismatch_webhook",
        currency="usd",
        unit_amount=2500,
        billing_interval=SubscriptionPrice.BillingInterval.MONTH,
    )
    attempt = CheckoutAttempt.objects.create(
        user=user,
        price=premium_price,
        expected_subscription=free_subscription,
        status=CheckoutAttempt.Status.COMPLETED,
        provider_checkout_session_id="cs_test_price_plan_mismatch",
    )
    event = {
        "id": "evt_checkout_price_plan_mismatch",
        "type": "checkout.session.completed",
        "data": {
            "object": {
                "id": "cs_test_price_plan_mismatch",
                "metadata": {
                    "checkout_attempt_id": str(attempt.id),
                    "subscription_price_id": str(premium_price.id),
                    "subscription_plan_id": str(pro_plan.id),
                    "user_id": str(user.id),
                },
            },
        },
    }

    process_stripe_webhook_event(event)

    attempt.refresh_from_db()

    assert StripeWebhookEvent.objects.filter(
        provider_event_id="evt_checkout_price_plan_mismatch",
    ).exists()
    assert attempt.status == CheckoutAttempt.Status.COMPLETED
    assert Subscription.objects.get(
        user=user,
        status=Subscription.Status.ACTIVE,
    ).plan == free_plan
    assert Subscription.objects.filter(user=user).count() == 1


def test_checkout_session_completed_with_unknown_attempt_id_is_ignored_safely():
    user = get_user_model().objects.create_user(
        email="unknown-attempt-webhook@example.com",
        password="strong-password-123",
    )
    free_plan = SubscriptionPlan.objects.get(code="free")
    Subscription.objects.create(
        user=user,
        plan=free_plan,
        status=Subscription.Status.ACTIVE,
    )
    pro_plan = SubscriptionPlan.objects.create(
        code="pro-unknown-attempt-webhook",
        name="Pro",
        active_custom_metric_limit=10,
        wearable_connection_limit=2,
        sync_interval_minutes=15,
    )
    pro_price = SubscriptionPrice.objects.create(
        plan=pro_plan,
        provider=SubscriptionPrice.Provider.STRIPE,
        provider_price_id="price_pro_unknown_attempt_webhook",
        currency="usd",
        unit_amount=1000,
        billing_interval=SubscriptionPrice.BillingInterval.MONTH,
    )
    event = {
        "id": "evt_checkout_unknown_attempt",
        "type": "checkout.session.completed",
        "data": {
            "object": {
                "id": "cs_test_unknown_attempt",
                "metadata": {
                    "checkout_attempt_id": str(uuid4()),
                    "subscription_price_id": str(pro_price.id),
                    "subscription_plan_id": str(pro_plan.id),
                    "user_id": str(user.id),
                },
            },
        },
    }

    process_stripe_webhook_event(event)

    assert StripeWebhookEvent.objects.filter(
        provider_event_id="evt_checkout_unknown_attempt",
    ).exists()
    assert Subscription.objects.get(
        user=user,
        status=Subscription.Status.ACTIVE,
    ).plan == free_plan
    assert Subscription.objects.filter(user=user).count() == 1


def test_checkout_session_completed_with_stale_expected_subscription_is_ignored_safely():
    user = get_user_model().objects.create_user(
        email="stale-webhook@example.com",
        password="strong-password-123",
    )
    free_plan = SubscriptionPlan.objects.get(code="free")
    free_subscription = Subscription.objects.create(
        user=user,
        plan=free_plan,
        status=Subscription.Status.ACTIVE,
    )
    pro_plan = SubscriptionPlan.objects.create(
        code="pro-stale-webhook",
        name="Pro",
        active_custom_metric_limit=10,
        wearable_connection_limit=2,
        sync_interval_minutes=15,
    )
    pro_price = SubscriptionPrice.objects.create(
        plan=pro_plan,
        provider=SubscriptionPrice.Provider.STRIPE,
        provider_price_id="price_pro_stale_webhook",
        currency="usd",
        unit_amount=1000,
        billing_interval=SubscriptionPrice.BillingInterval.MONTH,
    )
    premium_plan = SubscriptionPlan.objects.create(
        code="premium-stale-webhook",
        name="Premium",
        active_custom_metric_limit=25,
        wearable_connection_limit=5,
        sync_interval_minutes=5,
    )
    premium_price = SubscriptionPrice.objects.create(
        plan=premium_plan,
        provider=SubscriptionPrice.Provider.STRIPE,
        provider_price_id="price_premium_stale_webhook",
        currency="usd",
        unit_amount=2500,
        billing_interval=SubscriptionPrice.BillingInterval.MONTH,
    )

    #  expected_subscription=free_subscription "This Pro checkout is only valid if the user is still on this Free subscription when
    # Stripe confirms payment."
    attempt = CheckoutAttempt.objects.create(
        user=user,
        price=pro_price,
        expected_subscription=free_subscription,
        status=CheckoutAttempt.Status.COMPLETED,
        provider_checkout_session_id="cs_test_stale",
    )

    # Before Stripe webhook arrives, something else changes the user’s subscription.
    # This simulates reality: Stripe webhooks are async and can arrive late.
    # The user/account state may have changed since Checkout was started.
    free_subscription.status = Subscription.Status.CANCELLED
    free_subscription.save(update_fields=["status", "updated_at"])
    #New active subscription -> Premium
    Subscription.objects.create(
        user=user,
        plan=premium_plan,
        price=premium_price,
        status=Subscription.Status.ACTIVE,
    )

    # Then Stripe sends the old Pro checkout webhook. This webhook says: “the old Pro checkout completed.”
    event = {
        "id": "evt_checkout_stale",
        "type": "checkout.session.completed",
        "data": {
            "object": {
                "id": "cs_test_stale",
                "metadata": {
                    "checkout_attempt_id": str(attempt.id),
                    "subscription_price_id": str(pro_price.id),
                    "subscription_plan_id": str(pro_plan.id),
                    "user_id": str(user.id),
                },
            },
        },
    }

    process_stripe_webhook_event(event)

    attempt.refresh_from_db()

    assert StripeWebhookEvent.objects.filter(
        provider_event_id="evt_checkout_stale",
    ).exists()
    assert attempt.status == CheckoutAttempt.Status.COMPLETED
    assert Subscription.objects.get(
        user=user,
        status=Subscription.Status.ACTIVE,
    ).plan == premium_plan
    assert Subscription.objects.filter(user=user).count() == 2
