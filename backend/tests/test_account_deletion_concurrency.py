from concurrent.futures import ThreadPoolExecutor
from threading import Event
from unittest.mock import MagicMock, patch

import pytest
import stripe
from django.db import close_old_connections, connections

from apps.subscriptions.models import Subscription, SubscriptionPlan, SubscriptionPrice
from apps.subscriptions.services import create_checkout_session
from apps.users.account import delete_account
from apps.users.models import User

pytestmark = pytest.mark.django_db(transaction=True)


def test_deletion_waits_for_checkout_receipt_then_expires_its_link():
    user = User.objects.create_user(
        email="checkout-race@example.com", password="account-password-123"
    )
    plan, _ = SubscriptionPlan.objects.get_or_create(
        code="free",
        defaults={
            "name": "Free",
            "active_custom_metric_limit": 3,
            "wearable_connection_limit": 1,
            "sync_interval_minutes": 30,
            "is_default": True,
        },
    )
    Subscription.objects.create(user=user, plan=plan, status="active")
    price = SubscriptionPrice.objects.create(
        plan=plan,
        provider="stripe",
        provider_price_id="price_race",
        currency="usd",
        unit_amount=1000,
        billing_interval="month",
    )
    checkout_started, release_checkout = Event(), Event()
    deletion_started, deletion_finished = Event(), Event()
    sdk = MagicMock()

    def create(params: object, options: object) -> stripe.checkout.Session:
        checkout_started.set()
        assert release_checkout.wait(timeout=5)
        return stripe.checkout.Session.construct_from(
            {"id": "cs_race", "url": "https://checkout.stripe.com/race"}, key=None
        )

    sdk.v1.checkout.sessions.create.side_effect = create
    sdk.v1.checkout.sessions.retrieve.return_value = (
        stripe.checkout.Session.construct_from(
            {
                "id": "cs_race",
                "status": "open",
                "client_reference_id": str(user.pk),
            },
            key=None,
        )
    )
    sdk.v1.checkout.sessions.expire.return_value = (
        stripe.checkout.Session.construct_from(
            {"id": "cs_race", "status": "expired"}, key=None
        )
    )

    def checkout() -> str:
        close_old_connections()
        try:
            return create_checkout_session(user=user, price=price)
        finally:
            connections.close_all()

    def delete() -> None:
        close_old_connections()
        deletion_started.set()
        try:
            delete_account(user=user, password="account-password-123")
        finally:
            deletion_finished.set()
            connections.close_all()

    with patch("apps.subscriptions.services._stripe_client", return_value=sdk):
        with ThreadPoolExecutor(max_workers=2) as executor:
            checkout_future = executor.submit(checkout)
            assert checkout_started.wait(timeout=5)
            deletion_future = executor.submit(delete)
            assert deletion_started.wait(timeout=5)
            try:
                assert not deletion_finished.wait(timeout=0.2)
            finally:
                release_checkout.set()
            assert (
                checkout_future.result(timeout=5) == "https://checkout.stripe.com/race"
            )
            deletion_future.result(timeout=5)
    assert not User.objects.filter(pk=user.pk).exists()
    sdk.v1.checkout.sessions.expire.assert_called_once_with("cs_race")
