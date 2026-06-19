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
    )

def create_checkout_session(
    *,
    user: AbstractBaseUser,
    price: SubscriptionPrice,
) -> str:
    attempt = CheckoutAttempt.objects.create(
        user=user,
        price=price,
    )
    client = StripeClient(settings.STRIPE_SECRET_KEY)

    try:
        session = client.v1.checkout.sessions.create(
            {
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
                "customer_email": user.email,
                "metadata": {
                    "user_id": str(user.id),
                    "checkout_attempt_id": str(attempt.id),
                    "subscription_price_id": str(price.id),
                    "subscription_plan_id": str(price.plan_id),
                },
            },
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


def verify_stripe_webhook_event(
    *,
    payload: bytes,
    signature: str,
    webhook_secret: str,
) -> dict[str, Any]:
    return stripe.Webhook.construct_event(
        payload,
        signature,
        webhook_secret,
    )


def get_checkout_session_metadata_value(
    metadata: dict[str, str],
    key: str,
) -> str | None:
    value = metadata.get(key)

    if value == "":
        return None

    return value


@transaction.atomic
def process_stripe_webhook_event(event: dict[str, Any]) -> None:
    try:
        StripeWebhookEvent.objects.create(
            provider_event_id=event["id"],
            event_type=event["type"],
        )
    except IntegrityError:
        return None

    if event.get("type") != "checkout.session.completed":
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

    current_subscription = Subscription.objects.get(
        user=attempt.user,
        status__in=CURRENT_SUBSCRIPTION_STATUSES,
    )

    change_subscription_plan(
        user=attempt.user,
        plan=plan,
        price=price,
        expected_subscription_id=current_subscription.id,
    )

    attempt.status = CheckoutAttempt.Status.CONFIRMED
    attempt.save(update_fields=["status", "updated_at"])

    return None
