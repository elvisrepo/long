from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from django.conf import settings
from django.contrib.auth import get_user_model
from django.contrib.auth.models import AbstractBaseUser
from django.core.exceptions import ValidationError
from django.db import IntegrityError, transaction
from django.utils import timezone
import stripe
from stripe import StripeClient

from apps.subscriptions.models import (
    BillingCustomer,
    CheckoutAttempt,
    StripeWebhookEvent,
    Subscription,
    SubscriptionPlan,
    SubscriptionPrice,
)


CURRENT_SUBSCRIPTION_STATUSES = (
    Subscription.Status.TRIALING,
    Subscription.Status.ACTIVE,
    Subscription.Status.PAST_DUE,
    Subscription.Status.INCOMPLETE,
)


class StaleSubscriptionTransitionError(Exception):
    """Raised when the subscription observed by the caller is no longer current."""


def get_current_subscription_plan(
    user: AbstractBaseUser,
) -> SubscriptionPlan:
    subscription = (
        Subscription.objects.select_related("plan")
        .filter(
            user=user,
            status__in=CURRENT_SUBSCRIPTION_STATUSES,
        )
        .get()
    )

    return subscription.plan


# Entering this atomic function begins the transaction. A successful return
# commits it and releases the row lock; any exception rolls everything back.
@transaction.atomic
def change_subscription_plan(
    *,
    user: AbstractBaseUser,
    plan: SubscriptionPlan,
    price: SubscriptionPrice | None,
    expected_subscription_id: UUID,
    provider: str | None = None,
    provider_subscription_id: str | None = None,
) -> Subscription:
    # 1. Lock the user row so plan transitions for this account run one at a time.
    get_user_model().objects.select_for_update().get(pk=user.pk)

    # 2. Find the subscription currently responsible for the user's entitlements.
    current_subscription = Subscription.objects.get(
        user=user,
        status__in=CURRENT_SUBSCRIPTION_STATUSES,
    )

    # Reject a request that was based on subscription state replaced by an
    # earlier transition while this request was waiting for the user-row lock.
    if current_subscription.id != expected_subscription_id:
        raise StaleSubscriptionTransitionError

    if plan.is_default is False and price is None:
        raise ValidationError(
            {"price": "A price is required for a paid plan."}
        )

    if price is not None and price.is_active is False:
        raise ValidationError(
            {"price": "The selected price is not active."}
        )

    # 3. Turn the current row into history and record when it stopped being current.
    current_subscription.status = Subscription.Status.CANCELLED
    current_subscription.cancelled_at = timezone.now()
    current_subscription.save(
        update_fields=["status", "cancelled_at", "updated_at"],
    )

    # 4. Create the replacement current subscription using the requested plan.
    return Subscription.objects.create(
        user=user,
        plan=plan,
        price=price,
        status=Subscription.Status.ACTIVE,
        provider=provider,
        provider_subscription_id=provider_subscription_id,
    )


def create_checkout_session(
    *,
    user: AbstractBaseUser,
    price: SubscriptionPrice,
) -> str:
    current_subscription = Subscription.objects.get(
        user=user,
        status__in=CURRENT_SUBSCRIPTION_STATUSES,
    )
    attempt = CheckoutAttempt.objects.create(
        user=user,
        price=price,
        expected_subscription=current_subscription,
    )
    client = StripeClient(settings.STRIPE_SECRET_KEY)
    billing_customer = BillingCustomer.objects.filter(
        user=user,
        provider=BillingCustomer.Provider.STRIPE,
    ).first()

    session_params: dict[str, Any] = {
        # Stripe Checkout uses the provider price ID; clients only send our
        # internal SubscriptionPrice UUID to prevent price manipulation.
        "line_items": [
            {
                "price": price.provider_price_id,
                "quantity": 1,
            },
        ],
        "mode": "subscription",
        "success_url": settings.STRIPE_CHECKOUT_SUCCESS_URL,
        "cancel_url": settings.STRIPE_CHECKOUT_CANCEL_URL,
        "client_reference_id": str(user.id),
        "metadata": {
            "user_id": str(user.id),
            "checkout_attempt_id": str(attempt.id),
            "subscription_price_id": str(price.id),
            "subscription_plan_id": str(price.plan_id),
        },
    }

    # Reuse the known Stripe customer for returning users. First-time checkouts
    # still rely on email so Stripe can create the customer on its side.
    if billing_customer is not None:
        session_params["customer"] = billing_customer.provider_customer_id
    else:
        session_params["customer_email"] = user.email

    try:
        session = client.v1.checkout.sessions.create(
            session_params,
            options={
                "idempotency_key": str(attempt.id),
            },
        )
    except Exception:
        attempt.status = CheckoutAttempt.Status.FAILED
        attempt.save(update_fields=["status", "updated_at"])
        raise

    # Stripe created the provider session; webhook completion will later decide
    # whether the user's subscription should actually change.
    attempt.status = CheckoutAttempt.Status.COMPLETED
    attempt.provider_checkout_session_id = session.id
    attempt.save(
        update_fields=[
            "status",
            "provider_checkout_session_id",
            "updated_at",
        ]
    )

    return session.url


def create_customer_portal_session(
    *,
    billing_customer: BillingCustomer,
) -> str:
    client = StripeClient(settings.STRIPE_SECRET_KEY)
    session = client.v1.billing_portal.sessions.create(
        {
            "customer": billing_customer.provider_customer_id,
            "return_url": settings.STRIPE_CUSTOMER_PORTAL_RETURN_URL,
        }
    )

    return session.url


def verify_stripe_webhook_event(
    *,
    payload: bytes,
    signature: str,
    webhook_secret: str,
) -> dict[str, Any]:
    event = stripe.Webhook.construct_event(
        payload,
        signature,
        webhook_secret,
    )

    # Stripe SDK objects do not implement dict.get(). Normalize once at the
    # verification boundary so downstream reconciliation uses plain mappings.
    return event.to_dict()


def get_checkout_session_metadata_value(
    metadata: dict[str, str],
    key: str,
) -> str | None:
    value = metadata.get(key)

    if value == "":
        return None

    return value


def process_stripe_subscription_updated(
    stripe_subscription: dict[str, Any],
) -> None:
    provider_subscription_id = stripe_subscription.get("id")
    provider_customer_id = stripe_subscription.get("customer")
    provider_status = stripe_subscription.get("status")
    cancel_at_period_end = stripe_subscription.get("cancel_at_period_end")
    items = stripe_subscription.get("items")

    if (
        not isinstance(provider_subscription_id, str)
        or not isinstance(provider_customer_id, str)
        or provider_status != Subscription.Status.ACTIVE
        or not isinstance(cancel_at_period_end, bool)
        or not isinstance(items, dict)
    ):
        return

    item_data = items.get("data")

    # Current plans contain one recurring subscription item.
    if not isinstance(item_data, list) or len(item_data) != 1:
        return

    item = item_data[0]

    if not isinstance(item, dict):
        return

    period_start = item.get("current_period_start")
    period_end = item.get("current_period_end")

    if type(period_start) is not int or type(period_end) is not int:
        return

    subscription = (
        Subscription.objects.select_related("user")
        .filter(
            provider=SubscriptionPrice.Provider.STRIPE,
            provider_subscription_id=provider_subscription_id,
            status__in=CURRENT_SUBSCRIPTION_STATUSES,
        )
        .first()
    )

    if subscription is None:
        return

    customer_matches = BillingCustomer.objects.filter(
        user=subscription.user,
        provider=BillingCustomer.Provider.STRIPE,
        provider_customer_id=provider_customer_id,
    ).exists()

    if customer_matches is False:
        return

    subscription.cancel_at_period_end = cancel_at_period_end
    subscription.current_period_start = datetime.fromtimestamp(
        period_start,
        tz=UTC,
    )
    subscription.current_period_end = datetime.fromtimestamp(
        period_end,
        tz=UTC,
    )
    subscription.save(
        update_fields=[
            "cancel_at_period_end",
            "current_period_start",
            "current_period_end",
            "updated_at",
        ]
    )


def process_stripe_subscription_deleted(
    stripe_subscription: dict[str, Any],
) -> None:
    provider_subscription_id = stripe_subscription.get("id")
    provider_customer_id = stripe_subscription.get("customer")
    provider_status = stripe_subscription.get("status")

    if (
        not isinstance(provider_subscription_id, str)
        or not isinstance(provider_customer_id, str)
        or provider_status != "canceled"
    ):
        return

    subscription = (
        Subscription.objects.select_related("user")
        .filter(
            provider=SubscriptionPrice.Provider.STRIPE,
            provider_subscription_id=provider_subscription_id,
            status__in=CURRENT_SUBSCRIPTION_STATUSES,
        )
        .first()
    )

    if subscription is None:
        return

    customer_matches = BillingCustomer.objects.filter(
        user=subscription.user,
        provider=BillingCustomer.Provider.STRIPE,
        provider_customer_id=provider_customer_id,
    ).exists()

    if customer_matches is False:
        return

    # Missing Free-plan configuration must roll back the event ledger insert so
    # Stripe can retry after the application configuration is repaired.
    free_plan = SubscriptionPlan.objects.get(
        code="free",
        is_active=True,
        is_default=True,
    )

    try:
        change_subscription_plan(
            user=subscription.user,
            plan=free_plan,
            price=None,
            expected_subscription_id=subscription.id,
        )
    except StaleSubscriptionTransitionError:
        return


@transaction.atomic
def process_stripe_webhook_event(event: dict[str, Any]) -> None:
    try:
        # Idempotency part. multiple same operations will try to create StripeWebhookEvent with same provider_event_id=event
        StripeWebhookEvent.objects.create(
            provider_event_id=event["id"],
            event_type=event["type"],
        )
    except IntegrityError:
        return None

    event_type = event.get("type")

    if event_type == "customer.subscription.updated":
        stripe_subscription = event.get("data", {}).get("object")

        if isinstance(stripe_subscription, dict):
            process_stripe_subscription_updated(stripe_subscription)

        return None

    if event_type == "customer.subscription.deleted":
        stripe_subscription = event.get("data", {}).get("object")

        if isinstance(stripe_subscription, dict):
            process_stripe_subscription_deleted(stripe_subscription)

        return None

    if event_type != "checkout.session.completed":
        return None

    session = event["data"]["object"]
    # webhook metadata is Stripe sending back the IDs we attached earlier.
    # Those values came from our earlier create_checkout_session(...) call.
    metadata = session.get("metadata") or {}
    checkout_attempt_id = get_checkout_session_metadata_value(
        metadata,
        "checkout_attempt_id",
    )
    subscription_plan_id = get_checkout_session_metadata_value(
        metadata,
        "subscription_plan_id",
    )
    subscription_price_id = get_checkout_session_metadata_value(
        metadata,
        "subscription_price_id",
    )

    if (
        checkout_attempt_id is None
        or subscription_plan_id is None
        or subscription_price_id is None
    ):
        return None

    # We try to find the local checkout attempt by both attempt ID and Stripe session ID.
    attempt = (
        CheckoutAttempt.objects.select_related("user", "price")
        .filter(
            id=checkout_attempt_id,
            provider_checkout_session_id=session["id"],
        )
        .first()
    )

    if attempt is None:
        return None

    # resolves the plan and then looks up the price scoped to that plan
    plan = SubscriptionPlan.objects.filter(
        id=subscription_plan_id,
    ).first()

    price = SubscriptionPrice.objects.filter(
        id=subscription_price_id,
        plan=plan,
    ).first()

    if plan is None or price is None:
        return None

    if attempt.expected_subscription_id is None:
        return None

    provider_customer_id = session.get("customer")
    provider_subscription_id = session.get("subscription")

    if (
        not isinstance(provider_customer_id, str)
        or provider_customer_id == ""
        or not isinstance(provider_subscription_id, str)
        or provider_subscription_id == ""
    ):
        return None

    billing_customer = BillingCustomer.objects.filter(
        user=attempt.user,
        provider=BillingCustomer.Provider.STRIPE,
    ).first()

    if (
        billing_customer is not None
        and billing_customer.provider_customer_id != provider_customer_id
    ):
        return None

    customer_owned_by_another_user = (
        BillingCustomer.objects.filter(
            provider=BillingCustomer.Provider.STRIPE,
            provider_customer_id=provider_customer_id,
        )
        .exclude(user=attempt.user)
        .exists()
    )

    if customer_owned_by_another_user:
        return None

    try:
        change_subscription_plan(
            user=attempt.user,
            plan=plan,
            price=price,
            expected_subscription_id=attempt.expected_subscription_id,
            provider=BillingCustomer.Provider.STRIPE,
            provider_subscription_id=provider_subscription_id,
        )
    except StaleSubscriptionTransitionError:
        return None

    if billing_customer is None:
        BillingCustomer.objects.create(
            user=attempt.user,
            provider=BillingCustomer.Provider.STRIPE,
            provider_customer_id=provider_customer_id,
        )

    attempt.status = CheckoutAttempt.Status.CONFIRMED
    attempt.save(update_fields=["status", "updated_at"])

    return None
