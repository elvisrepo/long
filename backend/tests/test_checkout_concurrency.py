from concurrent.futures import ThreadPoolExecutor
from threading import Event
from unittest.mock import MagicMock, patch

from django.db import close_old_connections, connections
import pytest
import stripe

from apps.subscriptions.models import (
    CheckoutAttempt,
    Subscription,
    SubscriptionPlan,
    SubscriptionPrice,
)
from apps.subscriptions.services import create_checkout_session
from apps.users.models import User

pytestmark = pytest.mark.django_db(transaction=True)


def test_concurrent_checkout_requests_share_one_provider_session() -> None:
    user = User.objects.create_user(
        email="double-click@example.com", password="strong-password-123"
    )
    free, _ = SubscriptionPlan.objects.get_or_create(
        code="free",
        defaults={
            "name": "Free",
            "is_default": True,
            "active_custom_metric_limit": 3,
            "wearable_connection_limit": 1,
            "sync_interval_minutes": 30,
        },
    )
    Subscription.objects.create(user=user, plan=free, status="active")
    paid = SubscriptionPlan.objects.create(
        code="race-pro",
        name="Pro",
        active_custom_metric_limit=10,
        wearable_connection_limit=2,
        sync_interval_minutes=15,
    )
    price = SubscriptionPrice.objects.create(
        plan=paid,
        provider="stripe",
        provider_price_id="price_race",
        currency="usd",
        unit_amount=1000,
        billing_interval="month",
    )
    creating, release, second_started, second_done = Event(), Event(), Event(), Event()
    sdk = MagicMock()
    session = stripe.checkout.Session.construct_from(
        {
            "id": "cs_shared",
            "status": "open",
            "url": "https://checkout.stripe.com/shared",
            "client_reference_id": str(user.pk),
        },
        key=None,
    )

    def create(params: object, options: object) -> stripe.checkout.Session:
        creating.set()
        assert release.wait(timeout=5)
        return session

    sdk.v1.checkout.sessions.create.side_effect = create
    sdk.v1.checkout.sessions.retrieve.return_value = session

    def purchase(*, second: bool = False) -> str:
        close_old_connections()
        try:
            if second:
                second_started.set()
            return create_checkout_session(user=user, price=price)
        finally:
            if second:
                second_done.set()
            connections.close_all()

    with (
        patch("apps.subscriptions.services._stripe_client", return_value=sdk),
        ThreadPoolExecutor(max_workers=2) as pool,
    ):
        first = pool.submit(purchase)
        assert creating.wait(timeout=5)
        second = pool.submit(purchase, second=True)
        try:
            assert second_started.wait(timeout=5)
            assert not second_done.wait(timeout=0.2)
        finally:
            release.set()
        assert first.result(timeout=5) == session.url
        assert second.result(timeout=5) == session.url
    sdk.v1.checkout.sessions.create.assert_called_once()
    assert CheckoutAttempt.objects.filter(user=user).count() == 1
