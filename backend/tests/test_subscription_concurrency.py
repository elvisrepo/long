from concurrent.futures import ThreadPoolExecutor
from threading import Event

import pytest
from django.contrib.auth import get_user_model
from django.db import close_old_connections, connections, transaction

from apps.subscriptions.models import (
    Subscription,
    SubscriptionPlan,
    SubscriptionPrice,
)
from apps.subscriptions.services import (
    StaleSubscriptionTransitionError,
    change_subscription_plan,
)


# Real commits and separate thread connections are required to observe
# PostgreSQL row-lock blocking; pytest's normal wrapped transaction is not enough.
pytestmark = pytest.mark.django_db(transaction=True)


def create_plan(
    *,
    code: str,
    metric_limit: int,
) -> SubscriptionPlan:
    return SubscriptionPlan.objects.create(
        code=code,
        name=code.title(),
        active_custom_metric_limit=metric_limit,
        wearable_connection_limit=2,
        sync_interval_minutes=15,
    )


def test_concurrent_plan_changes_reject_stale_second_transition():
    user = get_user_model().objects.create_user(
        email="concurrent-upgrade@example.com",
        password="strong-password-123",
    )
    free_plan, _created = SubscriptionPlan.objects.get_or_create(
        code="free",
        defaults={
            "name": "Free",
            "active_custom_metric_limit": 3,
            "wearable_connection_limit": 0,
            "sync_interval_minutes": 60,
            "analytics_enabled": False,
            "csv_import_enabled": False,
            "is_default": True,
            "is_active": True,
        },
    )
    pro_plan = create_plan(code="pro", metric_limit=10)
    premium_plan = create_plan(code="premium", metric_limit=25)
    pro_price = SubscriptionPrice.objects.create(
        plan=pro_plan,
        provider=SubscriptionPrice.Provider.STRIPE,
        provider_price_id="price_concurrent_pro",
        currency="usd",
        unit_amount=1000,
        billing_interval=SubscriptionPrice.BillingInterval.MONTH,
    )
    premium_price = SubscriptionPrice.objects.create(
        plan=premium_plan,
        provider=SubscriptionPrice.Provider.STRIPE,
        provider_price_id="price_concurrent_premium",
        currency="usd",
        unit_amount=2000,
        billing_interval=SubscriptionPrice.BillingInterval.MONTH,
    )

    free_subscription = Subscription.objects.create(
        user=user,
        plan=free_plan,
        status=Subscription.Status.ACTIVE,
    )

    # Events make the race deterministic instead of depending on thread timing.
    first_transition_created = Event()  # Pro exists, but its transaction is open.
    release_first_transaction = Event()  # Allows the Pro transaction to commit.
    second_transition_started = Event()  # Premium worker has started.
    second_transition_finished = Event()  # Premium attempt returned or raised.

    def change_to_pro() -> None:
        # Each worker needs a connection independent from the test thread and
        # the other worker, matching separate production requests.
        close_old_connections()

        try:
            # Hold the transaction open after creating Pro so the second
            # transition must wait for the same user-row lock.
            with transaction.atomic():
                get_user_model().objects.select_for_update().get(pk=user.pk)

                # This nested atomic service reuses the surrounding transaction;
                # its changes are not committed until this outer block exits.
                change_subscription_plan(
                    user=user,
                    plan=pro_plan,
                    price=pro_price,
                    expected_subscription_id=free_subscription.id,
                )
                first_transition_created.set()
                release_first_transaction.wait(timeout=5)
        finally:
            connections.close_all()

    def change_to_premium() -> None:
        close_old_connections()
        second_transition_started.set()

        try:
            # The service tries to lock the same user row and must block until
            # change_to_pro releases its outer transaction. It then rejects
            # this request because Free is no longer the current subscription.
            change_subscription_plan(
                user=user,
                plan=premium_plan,
                price=premium_price,
                expected_subscription_id=free_subscription.id,
            )
        finally:
            second_transition_finished.set()
            connections.close_all()

    with ThreadPoolExecutor(max_workers=2) as executor:
        # Future objects let the test run both transitions concurrently and
        # later re-raise any exception that happened inside either worker.
        first_future = executor.submit(change_to_pro)

        try:
            assert first_transition_created.wait(timeout=5)

            second_future = executor.submit(change_to_premium)
            assert second_transition_started.wait(timeout=5)

            # Premium must remain blocked until the Pro transaction commits.
            assert second_transition_finished.wait(timeout=1) is False
        finally:
            release_first_transaction.set()

        first_future.result(timeout=5)
        with pytest.raises(StaleSubscriptionTransitionError):
            second_future.result(timeout=5)

    # Current statuses must identify exactly one effective subscription.
    current_subscriptions = Subscription.objects.filter(
        user=user,
        status__in=[
            Subscription.Status.TRIALING,
            Subscription.Status.ACTIVE,
            Subscription.Status.PAST_DUE,
            Subscription.Status.INCOMPLETE,
        ],
    )

    assert current_subscriptions.count() == 1
    assert current_subscriptions.get().plan == pro_plan

    # Only the accepted transition changes history.
    assert Subscription.objects.filter(
        user=user,
        plan=free_plan,
        status=Subscription.Status.CANCELLED,
    ).exists()
    assert Subscription.objects.filter(user=user, plan=premium_plan).exists() is False
    assert Subscription.objects.filter(user=user).count() == 2
