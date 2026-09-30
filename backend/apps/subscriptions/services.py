from datetime import UTC, datetime, timedelta
import logging
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
from stripe.params.checkout import SessionCreateParams

from apps.subscriptions.models import (
    BillingCustomer,
    CheckoutAttempt,
    StripeWebhookEvent,
    Subscription,
    SubscriptionPlan,
    SubscriptionPrice,
)


logger = logging.getLogger(__name__)

CURRENT_SUBSCRIPTION_STATUSES = (
    Subscription.Status.TRIALING,
    Subscription.Status.ACTIVE,
    Subscription.Status.PAST_DUE,
    Subscription.Status.INCOMPLETE,
)


class StaleSubscriptionTransitionError(Exception):
    """Raised when the subscription observed by the caller is no longer current."""


def _stripe_client() -> StripeClient:
    """Return Stripe's SDK client only when this runtime permits outbound calls."""

    if settings.STRIPE_OUTBOUND_API_ENABLED is False:
        raise RuntimeError("Stripe outbound API is disabled for this runtime.")

    return StripeClient(settings.STRIPE_SECRET_KEY)


class UnresolvedCheckoutError(RuntimeError):
    """A provider request may have succeeded without a saved session receipt."""


class CheckoutConflict(RuntimeError):
    """Another checkout or paid subscription prevents a new purchase."""


def cancel_account_billing(*, user: AbstractBaseUser) -> None:
    """Close checkout links and confirm cancellation before account erasure.

    The caller holds the user-row lock. Stripe mutations cannot roll back with
    PostgreSQL; every retry reads current provider state before mutating again.
    """
    attempts = list(CheckoutAttempt.objects.filter(user=user).exclude(status="expired"))
    if any(
        not attempt.provider_checkout_session_id
        and attempt.status in {"pending", "completed", "failed"}
        for attempt in attempts
    ):
        raise UnresolvedCheckoutError()

    subscriptions = list(Subscription.objects.filter(user=user, provider="stripe"))
    if any(
        not row.provider_subscription_id and row.status != "cancelled"
        for row in subscriptions
    ):
        raise RuntimeError("Active billing subscription has no provider receipt")
    customer_ids = set(
        BillingCustomer.objects.filter(user=user, provider="stripe").values_list(
            "provider_customer_id", flat=True
        )
    )
    customer_ids.update(
        row.provider_customer_id for row in subscriptions if row.provider_customer_id
    )
    if (
        not subscriptions
        and not customer_ids
        and not any(row.provider_checkout_session_id for row in attempts)
    ):
        return
    client = _stripe_client()
    subscription_ids = {
        row.provider_subscription_id
        for row in subscriptions
        if row.provider_subscription_id
    }

    checkout_customers: dict[str, str] = {}

    def accept_customer(customer_id: object, *, owned_checkout: bool = False) -> str:
        if not isinstance(customer_id, str) or not customer_id:
            raise RuntimeError("Missing billing customer")
        if customer_ids and customer_id not in customer_ids and not owned_checkout:
            raise RuntimeError("Billing customer mismatch")
        if (
            BillingCustomer.objects.filter(
                provider="stripe", provider_customer_id=customer_id
            )
            .exclude(user=user)
            .exists()
        ):
            raise RuntimeError("Billing customer belongs to another account")
        customer_ids.add(customer_id)
        return customer_id

    # Expire links before discovering subscriptions: a completed checkout can
    # have created a subscription that its webhook has not recorded locally yet.
    for attempt in attempts:
        if not attempt.provider_checkout_session_id:
            continue
        session = client.v1.checkout.sessions.retrieve(
            attempt.provider_checkout_session_id
        )
        if (
            session.id != attempt.provider_checkout_session_id
            or session.client_reference_id != str(user.pk)
        ):
            raise RuntimeError("Checkout ownership mismatch")
        if session.status == "open":
            session = client.v1.checkout.sessions.expire(session.id)
            if session.status != "expired":
                raise RuntimeError("Checkout expiration not confirmed")
        elif session.status == "complete":
            # A saved session with this user's client_reference_id proves a
            # historical customer even when its webhook never saved a mapping.
            customer_id = accept_customer(session.customer, owned_checkout=True)
            if not isinstance(session.subscription, str) or not session.subscription:
                raise RuntimeError("Completed checkout has no subscription")
            subscription_ids.add(session.subscription)
            checkout_customers[session.subscription] = customer_id
        elif session.status != "expired":
            raise RuntimeError("Unknown checkout status")

    resolved: dict[str, stripe.Subscription] = {}
    for subscription_id in sorted(subscription_ids):
        subscription = client.v1.subscriptions.retrieve(subscription_id)
        if subscription.id != subscription_id:
            raise RuntimeError("Subscription identity mismatch")
        if (
            subscription_id in checkout_customers
            and subscription.customer != checkout_customers[subscription_id]
        ):
            raise RuntimeError("Checkout subscription customer mismatch")
        accept_customer(subscription.customer)
        resolved[subscription_id] = subscription
    # Include every page and historical status so stale local state cannot hide
    # an active, trialing, incomplete, or past-due subscription for this customer.
    for customer_id in sorted(customer_ids):
        for subscription in client.v1.subscriptions.list(
            {"customer": customer_id, "status": "all", "limit": 100}
        ).auto_paging_iter():
            if subscription.customer != customer_id:
                raise RuntimeError("Subscription customer mismatch")
            resolved.setdefault(subscription.id, subscription)
    for subscription in resolved.values():
        if subscription.status in {"canceled", "incomplete_expired"}:
            continue
        cancelled = client.v1.subscriptions.cancel(
            subscription.id, {"invoice_now": False, "prorate": False}
        )
        if (
            cancelled.id != subscription.id
            or cancelled.customer != subscription.customer
            or cancelled.status != "canceled"
        ):
            raise RuntimeError("Subscription cancellation not confirmed")


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
    try:
        get_user_model().objects.select_for_update().get(pk=user.pk)
    except get_user_model().DoesNotExist:
        raise StaleSubscriptionTransitionError() from None

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
        raise ValidationError({"price": "A price is required for a paid plan."})

    if price is not None and price.is_active is False:
        raise ValidationError({"price": "The selected price is not active."})

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
    # Serialize checkout creation with account deletion, including saving the
    # receipt. Commit failed attempts before re-raising the provider exception.
    failure: Exception | None = None
    with transaction.atomic():
        get_user_model().objects.select_for_update().get(pk=user.pk)
        try:
            return _create_checkout_session(user=user, price=price)
        except Exception as exc:
            failure = exc
    assert failure is not None
    raise failure


def _create_checkout_session(
    *,
    user: AbstractBaseUser,
    price: SubscriptionPrice,
) -> str:
    client = _stripe_client()
    current_subscription = Subscription.objects.get(
        user=user,
        status__in=CURRENT_SUBSCRIPTION_STATUSES,
    )
    if (
        not current_subscription.plan.is_default
        or current_subscription.provider == "stripe"
    ):
        raise CheckoutConflict(
            "You already have a paid subscription. Manage it through billing settings."
        )
    reusable_url = _check_existing_checkouts(
        client=client, user=user, price=price, current=current_subscription
    )
    if reusable_url is not None:
        return reusable_url
    attempt = CheckoutAttempt.objects.create(
        user=user,
        price=price,
        expected_subscription=current_subscription,
    )
    billing_customer = BillingCustomer.objects.filter(
        user=user,
        provider=BillingCustomer.Provider.STRIPE,
    ).first()

    session_params: SessionCreateParams = {
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

    attempt.provider_checkout_session_id = session.id
    if session.url is None:
        attempt.status = CheckoutAttempt.Status.FAILED
        attempt.save(
            update_fields=["status", "provider_checkout_session_id", "updated_at"]
        )
        raise ValueError("Stripe Checkout Session did not include a redirect URL.")

    # Stripe created the provider session; webhook completion will later decide
    # whether the user's subscription should actually change.
    attempt.status = CheckoutAttempt.Status.COMPLETED
    attempt.save(
        update_fields=[
            "status",
            "provider_checkout_session_id",
            "updated_at",
        ]
    )

    return session.url


def _check_existing_checkouts(
    *,
    client: StripeClient,
    user: AbstractBaseUser,
    price: SubscriptionPrice,
    current: Subscription,
) -> str | None:
    """Reconcile receipts under the user lock before allowing another purchase."""
    reusable: stripe.checkout.Session | None = None
    open_sessions: list[stripe.checkout.Session] = []
    missing_historical_attempts: list[CheckoutAttempt] = []
    customer = BillingCustomer.objects.filter(user=user, provider="stripe").first()
    for attempt in (
        CheckoutAttempt.objects.filter(user=user)
        .exclude(status="expired")
        .order_by("created_at")
    ):
        if not attempt.provider_checkout_session_id:
            raise CheckoutConflict(
                "An earlier checkout needs billing verification. Please do not pay again."
            )
        try:
            session = client.v1.checkout.sessions.retrieve(
                attempt.provider_checkout_session_id
            )
        except stripe.InvalidRequestError as exc:
            if exc.http_status != 404 or exc.code != "resource_missing":
                raise
            # Sandbox retention may delete old receipts. Only confirmed history
            # or legacy sandbox receipts older than its retention window can be
            # reconciled via the saved customer's subscription list below.
            legacy_receipt = (
                attempt.status == CheckoutAttempt.Status.COMPLETED
                and settings.STRIPE_SECRET_KEY.startswith(("sk_test_", "rk_test_"))
                and attempt.created_at <= timezone.now() - timedelta(days=90)
            )
            if customer is None or (
                attempt.status != CheckoutAttempt.Status.CONFIRMED and not legacy_receipt
            ):
                raise CheckoutConflict(
                    "An earlier checkout needs billing verification. Please do not pay again."
                ) from exc
            missing_historical_attempts.append(attempt)
            continue
        if (
            session.id != attempt.provider_checkout_session_id
            or session.client_reference_id != str(user.pk)
        ):
            raise RuntimeError("Checkout ownership mismatch")
        if session.status == "complete":
            if not isinstance(session.subscription, str) or not session.subscription:
                raise RuntimeError("Completed checkout has no subscription")
            subscription = client.v1.subscriptions.retrieve(session.subscription)
            if (
                subscription.id != session.subscription
                or subscription.customer != session.customer
            ):
                raise RuntimeError("Checkout subscription ownership mismatch")
            if subscription.status not in {"canceled", "incomplete_expired"}:
                raise CheckoutConflict(
                    "A payment is already awaiting confirmation or a subscription exists. Please do not pay again."
                )
        elif session.status == "open":
            open_sessions.append(session)
            if (
                reusable is None
                and attempt.price_id == price.pk
                and attempt.expected_subscription_id == current.pk
                and session.url
            ):
                reusable = session
        elif session.status == "expired":
            attempt.status = CheckoutAttempt.Status.EXPIRED
            attempt.save(update_fields=["status", "updated_at"])
        else:
            raise RuntimeError("Unknown checkout status")
    if customer is not None:
        for subscription in client.v1.subscriptions.list(
            {"customer": customer.provider_customer_id, "status": "all", "limit": 100}
        ).auto_paging_iter():
            if subscription.customer != customer.provider_customer_id:
                raise RuntimeError("Subscription customer mismatch")
            if subscription.status not in {"canceled", "incomplete_expired"}:
                raise CheckoutConflict(
                    "A Stripe subscription already exists. Manage it through billing settings."
                )
    for session in open_sessions:
        if reusable is not None and session.id == reusable.id:
            continue
        expired = client.v1.checkout.sessions.expire(session.id)
        if expired.id != session.id or expired.status != "expired":
            raise RuntimeError("Checkout expiration not confirmed")
        CheckoutAttempt.objects.filter(
            user=user, provider_checkout_session_id=session.id
        ).update(status=CheckoutAttempt.Status.EXPIRED, updated_at=timezone.now())
    # Retire missing history only after all provider verification succeeded.
    for attempt in missing_historical_attempts:
        attempt.status = CheckoutAttempt.Status.EXPIRED
        attempt.save(update_fields=["status", "updated_at"])
    return reusable.url if reusable is not None else None


def create_customer_portal_session(
    *,
    billing_customer: BillingCustomer,
) -> str:
    client = _stripe_client()
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


@transaction.atomic
def process_stripe_subscription_updated(
    stripe_subscription: dict[str, Any],
) -> None:
    provider_subscription_id = stripe_subscription.get("id")
    provider_customer_id = stripe_subscription.get("customer")
    provider_status = stripe_subscription.get("status")
    cancel_at_period_end = stripe_subscription.get("cancel_at_period_end")
    cancel_at = stripe_subscription.get("cancel_at")
    items = stripe_subscription.get("items")

    if (
        not isinstance(provider_subscription_id, str)
        or not isinstance(provider_customer_id, str)
        or provider_status != Subscription.Status.ACTIVE
        or not isinstance(cancel_at_period_end, bool)
        or (cancel_at is not None and type(cancel_at) is not int)
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
    price = item.get("price")

    if type(period_start) is not int or type(period_end) is not int:
        return

    local_price = None

    if isinstance(price, dict):
        provider_price_id = price.get("id")

        if isinstance(provider_price_id, str):
            local_price = (
                SubscriptionPrice.objects.select_related("plan")
                .filter(
                    provider=SubscriptionPrice.Provider.STRIPE,
                    provider_price_id=provider_price_id,
                    is_active=True,
                    plan__is_active=True,
                )
                .first()
            )

            if local_price is None:
                logger.warning(
                    (
                        "Unknown active Stripe subscription price: "
                        "provider_price_id=%s "
                        "provider_subscription_id=%s "
                        "provider_customer_id=%s"
                    ),
                    provider_price_id,
                    provider_subscription_id,
                    provider_customer_id,
                    extra={
                        "provider_price_id": provider_price_id,
                        "provider_subscription_id": provider_subscription_id,
                        "provider_customer_id": provider_customer_id,
                    },
                )

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

    # A webhook can read a paid row just before account deletion commits. Lock
    # the owner and re-read the row before applying any delayed provider update.
    if (
        not get_user_model()
        .objects.select_for_update()
        .filter(pk=subscription.user_id)
        .exists()
    ):
        return
    subscription.refresh_from_db()
    if subscription.status not in CURRENT_SUBSCRIPTION_STATUSES:
        return

    customer_matches = BillingCustomer.objects.filter(
        user=subscription.user,
        provider=BillingCustomer.Provider.STRIPE,
        provider_customer_id=provider_customer_id,
    ).exists()

    if customer_matches is False:
        return

    # Stripe can represent period-end cancellation either with
    # cancel_at_period_end=true or with cancel_at equal to current_period_end.
    # Store the exact cancel_at timestamp, and keep our local boolean normalized
    # for simple entitlement/UI checks.
    scheduled_cancellation = cancel_at_period_end is True or cancel_at == period_end

    subscription.cancel_at_period_end = scheduled_cancellation
    subscription.cancel_at = (
        datetime.fromtimestamp(cancel_at, tz=UTC) if cancel_at is not None else None
    )
    subscription.current_period_start = datetime.fromtimestamp(
        period_start,
        tz=UTC,
    )
    subscription.current_period_end = datetime.fromtimestamp(
        period_end,
        tz=UTC,
    )
    update_fields = [
        "cancel_at_period_end",
        "cancel_at",
        "current_period_start",
        "current_period_end",
        "updated_at",
    ]

    if local_price is not None:
        subscription.plan = local_price.plan
        subscription.price = local_price
        update_fields.extend(["plan", "price"])

    subscription.save(update_fields=update_fields)


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

    if (
        not get_user_model()
        .objects.select_for_update()
        .filter(pk=attempt.user_id)
        .exists()
    ):
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
