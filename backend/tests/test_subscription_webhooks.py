from datetime import UTC, datetime
from unittest.mock import patch
from uuid import uuid4

import pytest
import stripe
from django.conf import settings
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from apps.subscriptions.models import (
    BillingCustomer,
    CheckoutAttempt,
    StripeWebhookEvent,
    Subscription,
    SubscriptionPlan,
    SubscriptionPrice,
)
from apps.subscriptions.services import (
    process_stripe_webhook_event,
    verify_stripe_webhook_event,
)

pytestmark = pytest.mark.django_db


def test_verify_stripe_webhook_event_normalizes_sdk_event_to_dict():
    sdk_event = stripe.Event.construct_from(
        {
            "id": "evt_sdk_object",
            "type": "checkout.session.completed",
            "data": {
                "object": {
                    "id": "cs_sdk_object",
                    "metadata": {},
                }
            },
        },
        key=None,
    )

    with patch(
        "apps.subscriptions.services.stripe.Webhook.construct_event",
        return_value=sdk_event,
    ):
        event = verify_stripe_webhook_event(
            payload=b'{"id":"evt_sdk_object"}',
            signature="valid-signature",
            webhook_secret="whsec_test",
        )

    assert isinstance(event, dict)
    assert event["data"]["object"]["id"] == "cs_sdk_object"


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
                "customer": "cus_test_paid",
                "subscription": "sub_test_paid",
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
    billing_customer = BillingCustomer.objects.get(
        user=user,
        provider=BillingCustomer.Provider.STRIPE,
    )
    assert billing_customer.provider_customer_id == "cus_test_paid"
    assert current_subscription.provider_subscription_id == "sub_test_paid"

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
                "customer": "cus_test_duplicate_paid",
                "subscription": "sub_test_duplicate_paid",
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


def test_checkout_completion_does_not_replace_existing_billing_customer():
    user = get_user_model().objects.create_user(
        email="billing-customer-conflict@example.com",
        password="strong-password-123",
    )
    free_plan = SubscriptionPlan.objects.get(code="free")
    free_subscription = Subscription.objects.create(
        user=user,
        plan=free_plan,
        status=Subscription.Status.ACTIVE,
    )
    pro_plan = SubscriptionPlan.objects.create(
        code="pro-customer-conflict",
        name="Pro",
        active_custom_metric_limit=10,
        wearable_connection_limit=2,
        sync_interval_minutes=15,
    )
    pro_price = SubscriptionPrice.objects.create(
        plan=pro_plan,
        provider=SubscriptionPrice.Provider.STRIPE,
        provider_price_id="price_customer_conflict",
        currency="usd",
        unit_amount=1000,
        billing_interval=SubscriptionPrice.BillingInterval.MONTH,
    )
    attempt = CheckoutAttempt.objects.create(
        user=user,
        price=pro_price,
        expected_subscription=free_subscription,
        status=CheckoutAttempt.Status.COMPLETED,
        provider_checkout_session_id="cs_customer_conflict",
    )

    billing_customer = BillingCustomer.objects.create(
        user=user,
        provider=BillingCustomer.Provider.STRIPE,
        provider_customer_id="cus_existing",
    )

    event = {
        "id": "evt_customer_conflict",
        "type": "checkout.session.completed",
        "data": {
            "object": {
                "id": "cs_customer_conflict",
                "customer": "cus_different",
                "subscription": "sub_customer_conflict",
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
    billing_customer.refresh_from_db()

    assert attempt.status == CheckoutAttempt.Status.COMPLETED
    assert free_subscription.status == Subscription.Status.ACTIVE
    assert Subscription.objects.filter(user=user).count() == 1
    assert billing_customer.provider_customer_id == "cus_existing"
    assert StripeWebhookEvent.objects.filter(
        provider_event_id="evt_customer_conflict",
    ).exists()


def test_checkout_completion_rejects_customer_owned_by_another_user():
    owner = get_user_model().objects.create_user(
        email="customer-owner@example.com",
        password="strong-password-123",
    )
    user = get_user_model().objects.create_user(
        email="customer-conflict@example.com",
        password="strong-password-123",
    )
    BillingCustomer.objects.create(
        user=owner,
        provider=BillingCustomer.Provider.STRIPE,
        provider_customer_id="cus_already_owned",
    )

    free_plan = SubscriptionPlan.objects.get(code="free")
    free_subscription = Subscription.objects.create(
        user=user,
        plan=free_plan,
        status=Subscription.Status.ACTIVE,
    )
    pro_plan = SubscriptionPlan.objects.create(
        code="pro-owned-customer-conflict",
        name="Pro",
        active_custom_metric_limit=10,
        wearable_connection_limit=2,
        sync_interval_minutes=15,
    )
    pro_price = SubscriptionPrice.objects.create(
        plan=pro_plan,
        provider=SubscriptionPrice.Provider.STRIPE,
        provider_price_id="price_owned_customer_conflict",
        currency="usd",
        unit_amount=1000,
        billing_interval=SubscriptionPrice.BillingInterval.MONTH,
    )
    attempt = CheckoutAttempt.objects.create(
        user=user,
        price=pro_price,
        expected_subscription=free_subscription,
        status=CheckoutAttempt.Status.COMPLETED,
        provider_checkout_session_id="cs_owned_customer_conflict",
    )
    event = {
        "id": "evt_owned_customer_conflict",
        "type": "checkout.session.completed",
        "data": {
            "object": {
                "id": "cs_owned_customer_conflict",
                "customer": "cus_already_owned",
                "subscription": "sub_owned_customer_conflict",
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

    assert attempt.status == CheckoutAttempt.Status.COMPLETED
    assert free_subscription.status == Subscription.Status.ACTIVE
    assert Subscription.objects.filter(user=user).count() == 1
    assert StripeWebhookEvent.objects.filter(
        provider_event_id="evt_owned_customer_conflict",
    ).exists()


def test_subscription_updated_schedules_cancellation_without_revoking_pro():
    user = get_user_model().objects.create_user(
        email="scheduled-cancellation@example.com",
        password="strong-password-123",
    )

    pro_plan = SubscriptionPlan.objects.create(
        code="pro-scheduled-cancellation",
        name="Pro",
        active_custom_metric_limit=10,
        wearable_connection_limit=2,
        sync_interval_minutes=15,
    )
    pro_price = SubscriptionPrice.objects.create(
        plan=pro_plan,
        provider=SubscriptionPrice.Provider.STRIPE,
        provider_price_id="price_scheduled_cancellation",
        currency="usd",
        unit_amount=1000,
        billing_interval=SubscriptionPrice.BillingInterval.MONTH,
    )

    subscription = Subscription.objects.create(
        user=user,
        plan=pro_plan,
        price=pro_price,
        status=Subscription.Status.ACTIVE,
        provider=SubscriptionPrice.Provider.STRIPE,
        provider_subscription_id="sub_scheduled_cancellation",
    )
    BillingCustomer.objects.create(
        user=user,
        provider=BillingCustomer.Provider.STRIPE,
        provider_customer_id="cus_scheduled_cancellation",
    )

    period_start = 1782815656
    period_end = 1785407656

    event = {
        "id": "evt_scheduled_cancellation",
        "type": "customer.subscription.updated",
        "data": {
            "object": {
                "id": "sub_scheduled_cancellation",
                "customer": "cus_scheduled_cancellation",
                "status": "active",
                "cancel_at_period_end": True,
                "items": {
                    "data": [
                        {
                            "current_period_start": period_start,
                            "current_period_end": period_end,
                        }
                    ]
                },
            }
        },
    }

    process_stripe_webhook_event(event)

    subscription.refresh_from_db()

    assert subscription.status == Subscription.Status.ACTIVE
    assert subscription.plan == pro_plan
    assert subscription.cancel_at_period_end is True
    assert subscription.current_period_start == datetime.fromtimestamp(
        period_start,
        tz=UTC,
    )
    assert subscription.current_period_end == datetime.fromtimestamp(
        period_end,
        tz=UTC,
    )
    assert Subscription.objects.filter(user=user).count() == 1
    assert StripeWebhookEvent.objects.filter(
        provider_event_id="evt_scheduled_cancellation",
    ).exists()


def test_subscription_updated_normalizes_cancel_at_period_end_timestamp():
    """Treat Stripe cancel_at == period_end as period-end cancellation.

    Stripe Portal/flexible billing can send cancel_at_period_end=false while
    setting cancel_at to the subscription item's current_period_end. That still
    means the paid subscription is scheduled to end at the period boundary, so
    the local subscription keeps Pro active and normalizes
    cancel_at_period_end to true.
    """

    user = get_user_model().objects.create_user(
        email="flexible-cancellation@example.com",
        password="strong-password-123",
    )

    pro_plan = SubscriptionPlan.objects.create(
        code="pro-flexible-cancellation",
        name="Pro",
        active_custom_metric_limit=10,
        wearable_connection_limit=2,
        sync_interval_minutes=15,
    )

    pro_price = SubscriptionPrice.objects.create(
        plan=pro_plan,
        provider=SubscriptionPrice.Provider.STRIPE,
        provider_price_id="price_flexible_cancellation",
        currency="usd",
        unit_amount=1000,
        billing_interval=SubscriptionPrice.BillingInterval.MONTH,
    )

    subscription = Subscription.objects.create(
        user=user,
        plan=pro_plan,
        price=pro_price,
        status=Subscription.Status.ACTIVE,
        provider=SubscriptionPrice.Provider.STRIPE,
        provider_subscription_id="sub_flexible_cancellation",
    )

    BillingCustomer.objects.create(
        user=user,
        provider=BillingCustomer.Provider.STRIPE,
        provider_customer_id="cus_flexible_cancellation",
    )

    period_start = 1782987316
    period_end = 1785665716

    event = {
        "id": "evt_flexible_cancellation",
        "type": "customer.subscription.updated",
        "data": {
            "object": {
                "id": "sub_flexible_cancellation",
                "customer": "cus_flexible_cancellation",
                "status": "active",
                "cancel_at": period_end,
                "cancel_at_period_end": False,
                "items": {
                    "data": [
                        {
                            "current_period_start": period_start,
                            "current_period_end": period_end,
                        }
                    ]
                },
            }
        },
    }

    process_stripe_webhook_event(event)

    subscription.refresh_from_db()

    assert subscription.status == Subscription.Status.ACTIVE
    assert subscription.plan == pro_plan
    assert subscription.cancel_at_period_end is True
    assert subscription.cancel_at == datetime.fromtimestamp(
        period_end,
        tz=UTC,
    )
    assert subscription.current_period_end == datetime.fromtimestamp(
        period_end,
        tz=UTC,
    )


def test_subscription_updated_stores_custom_cancel_at_without_period_end_flag():
    """Store custom Stripe cancel_at without marking period-end cancellation.

    If Stripe sends a future cancel_at that differs from current_period_end,
    the local subscription should preserve the exact cancellation timestamp but
    keep cancel_at_period_end false because the cancellation is not scheduled
    for the normal billing-period boundary.
    """
    user = get_user_model().objects.create_user(
        email="custom-cancel-at@example.com",
        password="strong-password-123",
    )
    pro_plan = SubscriptionPlan.objects.create(
        code="pro-custom-cancel-at",
        name="Pro",
        active_custom_metric_limit=10,
        wearable_connection_limit=2,
        sync_interval_minutes=15,
    )
    pro_price = SubscriptionPrice.objects.create(
        plan=pro_plan,
        provider=SubscriptionPrice.Provider.STRIPE,
        provider_price_id="price_custom_cancel_at",
        currency="usd",
        unit_amount=1000,
        billing_interval=SubscriptionPrice.BillingInterval.MONTH,
    )
    subscription = Subscription.objects.create(
        user=user,
        plan=pro_plan,
        price=pro_price,
        status=Subscription.Status.ACTIVE,
        provider=SubscriptionPrice.Provider.STRIPE,
        provider_subscription_id="sub_custom_cancel_at",
    )
    BillingCustomer.objects.create(
        user=user,
        provider=BillingCustomer.Provider.STRIPE,
        provider_customer_id="cus_custom_cancel_at",
    )

    period_start = 1782987316
    custom_cancel_at = 1784000000
    period_end = 1785665716

    event = {
        "id": "evt_custom_cancel_at",
        "type": "customer.subscription.updated",
        "data": {
            "object": {
                "id": "sub_custom_cancel_at",
                "customer": "cus_custom_cancel_at",
                "status": "active",
                "cancel_at": custom_cancel_at,
                "cancel_at_period_end": False,
                "items": {
                    "data": [
                        {
                            "current_period_start": period_start,
                            "current_period_end": period_end,
                        }
                    ]
                },
            }
        },
    }

    process_stripe_webhook_event(event)

    subscription.refresh_from_db()

    assert subscription.status == Subscription.Status.ACTIVE
    assert subscription.cancel_at_period_end is False
    assert subscription.cancel_at == datetime.fromtimestamp(
        custom_cancel_at,
        tz=UTC,
    )
    assert subscription.current_period_end == datetime.fromtimestamp(
        period_end,
        tz=UTC,
    )


def test_subscription_updated_reconciles_stripe_price_change():
    """Update the local subscription price from Stripe subscription item price.

    Stripe Portal can switch a user from monthly Pro to yearly Pro on the same
    provider subscription. The webhook must update our local Subscription.price
    so local billing state does not drift from Stripe.
    """
    user = get_user_model().objects.create_user(
        email="stripe-price-change@example.com",
        password="strong-password-123",
    )
    pro_plan = SubscriptionPlan.objects.create(
        code="pro-price-change",
        name="Pro",
        active_custom_metric_limit=10,
        wearable_connection_limit=2,
        sync_interval_minutes=15,
    )
    monthly_price = SubscriptionPrice.objects.create(
        plan=pro_plan,
        provider=SubscriptionPrice.Provider.STRIPE,
        provider_price_id="price_pro_monthly_change",
        currency="usd",
        unit_amount=1000,
        billing_interval=SubscriptionPrice.BillingInterval.MONTH,
    )
    yearly_price = SubscriptionPrice.objects.create(
        plan=pro_plan,
        provider=SubscriptionPrice.Provider.STRIPE,
        provider_price_id="price_pro_yearly_change",
        currency="usd",
        unit_amount=10000,
        billing_interval=SubscriptionPrice.BillingInterval.YEAR,
    )
    subscription = Subscription.objects.create(
        user=user,
        plan=pro_plan,
        price=monthly_price,
        status=Subscription.Status.ACTIVE,
        provider=SubscriptionPrice.Provider.STRIPE,
        provider_subscription_id="sub_price_change",
    )
    BillingCustomer.objects.create(
        user=user,
        provider=BillingCustomer.Provider.STRIPE,
        provider_customer_id="cus_price_change",
    )

    period_start = 1784000000
    period_end = 1815536000

    event = {
        "id": "evt_price_change",
        "type": "customer.subscription.updated",
        "data": {
            "object": {
                "id": "sub_price_change",
                "customer": "cus_price_change",
                "status": "active",
                "cancel_at": None,
                "cancel_at_period_end": False,
                "items": {
                    "data": [
                        {
                            "price": {
                                "id": "price_pro_yearly_change",
                            },
                            "current_period_start": period_start,
                            "current_period_end": period_end,
                        }
                    ]
                },
            }
        },
    }

    process_stripe_webhook_event(event)

    subscription.refresh_from_db()

    assert subscription.status == Subscription.Status.ACTIVE
    assert subscription.plan == pro_plan
    assert subscription.price == yearly_price
    assert subscription.cancel_at is None
    assert subscription.cancel_at_period_end is False
    assert subscription.current_period_start == datetime.fromtimestamp(
        period_start,
        tz=UTC,
    )
    assert subscription.current_period_end == datetime.fromtimestamp(
        period_end,
        tz=UTC,
    )


def test_subscription_updated_logs_unknown_stripe_price_without_drift_change(
    caplog: pytest.LogCaptureFixture,
):
    """Log unknown Stripe item prices while preserving local price state.

    A Stripe price that is missing or inactive locally cannot be mapped safely
    to entitlements. The webhook should still synchronize period/cancellation
    fields, but leave the local plan and price unchanged and emit an
    operational warning.
    """
    user = get_user_model().objects.create_user(
        email="unknown-stripe-price@example.com",
        password="strong-password-123",
    )
    pro_plan = SubscriptionPlan.objects.create(
        code="pro-unknown-stripe-price",
        name="Pro",
        active_custom_metric_limit=10,
        wearable_connection_limit=2,
        sync_interval_minutes=15,
    )
    monthly_price = SubscriptionPrice.objects.create(
        plan=pro_plan,
        provider=SubscriptionPrice.Provider.STRIPE,
        provider_price_id="price_known_monthly",
        currency="usd",
        unit_amount=1000,
        billing_interval=SubscriptionPrice.BillingInterval.MONTH,
    )
    subscription = Subscription.objects.create(
        user=user,
        plan=pro_plan,
        price=monthly_price,
        status=Subscription.Status.ACTIVE,
        provider=SubscriptionPrice.Provider.STRIPE,
        provider_subscription_id="sub_unknown_price",
    )
    BillingCustomer.objects.create(
        user=user,
        provider=BillingCustomer.Provider.STRIPE,
        provider_customer_id="cus_unknown_price",
    )

    period_start = 1784000000
    period_end = 1815536000

    event = {
        "id": "evt_unknown_price",
        "type": "customer.subscription.updated",
        "data": {
            "object": {
                "id": "sub_unknown_price",
                "customer": "cus_unknown_price",
                "status": "active",
                "cancel_at": None,
                "cancel_at_period_end": False,
                "items": {
                    "data": [
                        {
                            "price": {
                                "id": "price_unknown_yearly",
                            },
                            "current_period_start": period_start,
                            "current_period_end": period_end,
                        }
                    ]
                },
            }
        },
    }

    process_stripe_webhook_event(event)

    subscription.refresh_from_db()

    assert subscription.price == monthly_price
    assert subscription.plan == pro_plan
    assert subscription.current_period_start == datetime.fromtimestamp(
        period_start,
        tz=UTC,
    )
    assert subscription.current_period_end == datetime.fromtimestamp(
        period_end,
        tz=UTC,
    )
    assert "Unknown active Stripe subscription price" in caplog.text
    assert "price_unknown_yearly" in caplog.text
    assert "sub_unknown_price" in caplog.text


def test_subscription_updated_rejects_mismatched_billing_customer():
    user = get_user_model().objects.create_user(
        email="updated-customer-mismatch@example.com",
        password="strong-password-123",
    )
    pro_plan = SubscriptionPlan.objects.create(
        code="pro-updated-customer-mismatch",
        name="Pro",
        active_custom_metric_limit=10,
        wearable_connection_limit=2,
        sync_interval_minutes=15,
    )
    pro_price = SubscriptionPrice.objects.create(
        plan=pro_plan,
        provider=SubscriptionPrice.Provider.STRIPE,
        provider_price_id="price_updated_customer_mismatch",
        currency="usd",
        unit_amount=1000,
        billing_interval=SubscriptionPrice.BillingInterval.MONTH,
    )
    subscription = Subscription.objects.create(
        user=user,
        plan=pro_plan,
        price=pro_price,
        status=Subscription.Status.ACTIVE,
        provider=SubscriptionPrice.Provider.STRIPE,
        provider_subscription_id="sub_updated_customer_mismatch",
    )
    BillingCustomer.objects.create(
        user=user,
        provider=BillingCustomer.Provider.STRIPE,
        provider_customer_id="cus_expected",
    )
    event = {
        "id": "evt_updated_customer_mismatch",
        "type": "customer.subscription.updated",
        "data": {
            "object": {
                "id": "sub_updated_customer_mismatch",
                "customer": "cus_different",
                "status": "active",
                "cancel_at_period_end": True,
                "items": {
                    "data": [
                        {
                            "current_period_start": 1782815656,
                            "current_period_end": 1785407656,
                        }
                    ]
                },
            }
        },
    }

    process_stripe_webhook_event(event)

    subscription.refresh_from_db()

    assert subscription.status == Subscription.Status.ACTIVE
    assert subscription.cancel_at_period_end is False
    assert subscription.current_period_start is None
    assert subscription.current_period_end is None
    assert Subscription.objects.filter(user=user).count() == 1
    assert StripeWebhookEvent.objects.filter(
        provider_event_id="evt_updated_customer_mismatch",
    ).exists()


def test_subscription_deleted_downgrades_user_to_free():
    user = get_user_model().objects.create_user(
        email="completed-cancellation@example.com",
        password="strong-password-123",
    )
    free_plan = SubscriptionPlan.objects.get(code="free")
    pro_plan = SubscriptionPlan.objects.create(
        code="pro-completed-cancellation",
        name="Pro",
        active_custom_metric_limit=10,
        wearable_connection_limit=2,
        sync_interval_minutes=15,
    )
    pro_price = SubscriptionPrice.objects.create(
        plan=pro_plan,
        provider=SubscriptionPrice.Provider.STRIPE,
        provider_price_id="price_completed_cancellation",
        currency="usd",
        unit_amount=1000,
        billing_interval=SubscriptionPrice.BillingInterval.MONTH,
    )
    pro_subscription = Subscription.objects.create(
        user=user,
        plan=pro_plan,
        price=pro_price,
        status=Subscription.Status.ACTIVE,
        provider=SubscriptionPrice.Provider.STRIPE,
        provider_subscription_id="sub_completed_cancellation",
        cancel_at_period_end=True,
    )
    billing_customer = BillingCustomer.objects.create(
        user=user,
        provider=BillingCustomer.Provider.STRIPE,
        provider_customer_id="cus_completed_cancellation",
    )

    event = {
        "id": "evt_completed_cancellation",
        "type": "customer.subscription.deleted",
        "data": {
            "object": {
                "id": "sub_completed_cancellation",
                "customer": "cus_completed_cancellation",
                "status": "canceled",
            }
        },
    }

    process_stripe_webhook_event(event)

    pro_subscription.refresh_from_db()
    billing_customer.refresh_from_db()

    free_subscription = Subscription.objects.get(
        user=user,
        status=Subscription.Status.ACTIVE,
    )

    assert pro_subscription.status == Subscription.Status.CANCELLED
    assert pro_subscription.cancelled_at is not None

    assert free_subscription.plan == free_plan
    assert free_subscription.price is None
    assert free_subscription.provider is None
    assert free_subscription.provider_subscription_id is None

    assert billing_customer.provider_customer_id == "cus_completed_cancellation"
    assert Subscription.objects.filter(user=user).count() == 2
    assert StripeWebhookEvent.objects.filter(
        provider_event_id="evt_completed_cancellation",
    ).exists()
