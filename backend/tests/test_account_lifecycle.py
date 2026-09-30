import json
import uuid
from unittest.mock import MagicMock, patch

import stripe

import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.token_blacklist.models import OutstandingToken

from apps.metrics.models import MetricDefinition, MetricEntry
from apps.subscriptions.models import (
    BillingCustomer,
    CheckoutAttempt,
    Subscription,
    SubscriptionPlan,
    SubscriptionPrice,
)
from apps.users.models import User
from apps.subscriptions.services import (
    StaleSubscriptionTransitionError,
    change_subscription_plan,
)
from apps.wearables.models import SyncRun, WearableConnection

pytestmark = pytest.mark.django_db


def account_client(email: str = "owner@example.com") -> tuple[APIClient, User]:
    user = get_user_model().objects.create_user(
        email=email, password="account-password-123"
    )
    client = APIClient()
    client.credentials(
        HTTP_AUTHORIZATION=f"Bearer {RefreshToken.for_user(user).access_token}"
    )
    return client, user


def test_free_account_export_contains_owned_data_without_credentials():
    client, user = account_client()
    _, other = account_client("other@example.com")
    definition = MetricDefinition.objects.get(slug="body_weight", user=None)
    for owner, value in [(user, 80), (other, 90)]:
        MetricEntry.objects.create(
            user=owner,
            metric_definition=definition,
            value=value,
            recorded_at="2026-09-30T08:00:00Z",
        )

    response = client.get("/api/v1/me/export/")

    assert response.status_code == 200
    assert response["Cache-Control"] == "no-store"
    assert (
        response["Content-Disposition"]
        == 'attachment; filename="longevity-account.json"'
    )
    data = json.loads(b"".join(response.streaming_content))
    assert data["schema_version"] == 1
    assert data["profile"] == {
        "id": str(user.pk),
        "email": user.email,
        "sleep_target_minutes": 450,
        "last_login": None,
    }
    assert [entry["value"] for entry in data["metric_entries"]] == [80]
    assert any(item["slug"] == "body_weight" for item in data["metric_definitions"])
    assert "password" not in data["profile"]
    assert "email_lookup_hash" not in data["profile"]
    assert "tokens" not in data
    assert len(data["sessions"]) == 1
    assert set(data["sessions"][0]) == {"created_at", "expires_at"}
    assert user.password not in json.dumps(data)


def test_export_includes_archived_metrics_sync_and_billing_history_only_for_owner():
    client, user = account_client()
    _, other = account_client("other@example.com")
    for owner in [user, other]:
        MetricDefinition.objects.create(
            user=owner,
            slug="feeling",
            name="Feeling",
            unit="score",
            category="custom",
            min_value=0,
            max_value=10,
            is_active=False,
        )
        connection = WearableConnection.objects.create(
            user=owner, provider="health_connect"
        )
        SyncRun.objects.create(wearable_connection=connection, upload_id=uuid.uuid4())
        BillingCustomer.objects.create(
            user=owner, provider="stripe", provider_customer_id=f"cus_{owner.pk}"
        )
        subscription = Subscription.objects.create(
            user=owner, plan=SubscriptionPlan.objects.get(code="free"), status="active"
        )
        price = SubscriptionPrice.objects.create(
            plan=subscription.plan,
            provider="stripe",
            provider_price_id=f"price_{owner.pk}",
            currency="usd",
            unit_amount=1000,
            billing_interval="month",
            is_active=False,
        )
        CheckoutAttempt.objects.create(
            user=owner, price=price, expected_subscription=subscription
        )

    response = client.get("/api/v1/me/export/", {"user": str(other.pk)})
    data = json.loads(b"".join(response.streaming_content))

    for key in [
        "metric_definitions",
        "wearable_connections",
        "sync_runs",
        "billing_customers",
        "subscriptions",
        "checkout_attempts",
    ]:
        assert len(data[key]) == 1
    assert data["metric_definitions"][0]["is_active"] is False
    assert data["billing_customers"][0]["provider_customer_id"] == f"cus_{user.pk}"
    assert str(other.pk) not in json.dumps(data)


@pytest.mark.parametrize("path", ["/api/v1/me/export/", "/api/v1/me/"])
def test_account_actions_require_authentication(path: str):
    response = (
        APIClient().get(path) if path.endswith("export/") else APIClient().delete(path)
    )
    assert response.status_code == 401


def test_deletion_erases_owned_rows_and_sessions_but_keeps_other_users_and_defaults():
    client, user = account_client()
    _, other = account_client("other@example.com")
    definition = MetricDefinition.objects.create(
        user=user,
        slug="feeling",
        name="Feeling",
        unit="score",
        category="custom",
        min_value=0,
        max_value=10,
    )
    connection = WearableConnection.objects.create(user=user, provider="health_connect")
    MetricEntry.objects.create(
        user=user,
        metric_definition=definition,
        value=5,
        recorded_at="2026-09-30T08:00:00Z",
        source_connection=connection,
    )
    SyncRun.objects.create(wearable_connection=connection, upload_id=uuid.uuid4())
    subscription = Subscription.objects.create(
        user=user, plan=SubscriptionPlan.objects.get(code="free"), status="active"
    )
    price = SubscriptionPrice.objects.create(
        plan=subscription.plan,
        provider="stripe",
        provider_price_id="price_history",
        currency="usd",
        unit_amount=1000,
        billing_interval="month",
    )
    CheckoutAttempt.objects.create(
        user=user, price=price, expected_subscription=subscription, status="expired"
    )
    refresh = RefreshToken.for_user(user)
    client.cookies["refresh_token"] = str(refresh)

    response = client.delete(
        "/api/v1/me/", {"password": "account-password-123"}, format="json"
    )

    assert response.status_code == 204
    assert response.cookies["refresh_token"]["max-age"] == 0
    assert not get_user_model().objects.filter(pk=user.pk).exists()
    assert get_user_model().objects.filter(pk=other.pk).exists()
    assert not MetricEntry.objects.filter(user_id=user.pk).exists()
    assert not MetricDefinition.objects.filter(user_id=user.pk).exists()
    assert not WearableConnection.objects.filter(user_id=user.pk).exists()
    assert not SyncRun.objects.filter(wearable_connection_id=connection.pk).exists()
    assert not CheckoutAttempt.objects.filter(user_id=user.pk).exists()
    assert not Subscription.objects.filter(user_id=user.pk).exists()
    assert not OutstandingToken.objects.filter(jti=refresh["jti"]).exists()
    assert MetricDefinition.objects.filter(user=None, slug="body_weight").exists()
    assert client.get("/api/auth/me/").status_code == 401
    assert (
        client.post(
            "/api/auth/mobile/refresh/", {"refresh": str(refresh)}, format="json"
        ).status_code
        == 401
    )


@pytest.mark.parametrize("body", [{}, {"password": "incorrect"}])
def test_deletion_requires_current_password_and_preserves_data_on_failure(
    body: dict[str, str],
):
    client, user = account_client()
    response = client.delete("/api/v1/me/", body, format="json")
    assert response.status_code == 400
    assert "password" in response.json()
    assert get_user_model().objects.filter(pk=user.pk).exists()
    assert OutstandingToken.objects.filter(user=user).exists()


def test_paid_account_deletion_confirms_immediate_cancellation_before_erasing_data():
    client, user = account_client()
    BillingCustomer.objects.create(
        user=user, provider="stripe", provider_customer_id="cus_owner"
    )
    Subscription.objects.create(
        user=user,
        plan=SubscriptionPlan.objects.get(code="free"),
        status="active",
        provider="stripe",
        provider_subscription_id="sub_owner",
    )
    sdk = MagicMock()
    active = stripe.Subscription.construct_from(
        {"id": "sub_owner", "customer": "cus_owner", "status": "active"}, key=None
    )
    sdk.v1.subscriptions.retrieve.return_value = active
    sdk.v1.subscriptions.list.return_value.auto_paging_iter.return_value = iter(
        [active]
    )

    def cancel(subscription_id: str, params: dict[str, bool]) -> stripe.Subscription:
        assert get_user_model().objects.filter(pk=user.pk).exists()
        assert subscription_id == "sub_owner"
        assert params == {"invoice_now": False, "prorate": False}
        return stripe.Subscription.construct_from(
            {"id": "sub_owner", "customer": "cus_owner", "status": "canceled"}, key=None
        )

    sdk.v1.subscriptions.cancel.side_effect = cancel
    with patch("apps.subscriptions.services._stripe_client", return_value=sdk):
        response = client.delete(
            "/api/v1/me/", {"password": "account-password-123"}, format="json"
        )
    assert response.status_code == 204
    sdk.v1.subscriptions.cancel.assert_called_once()
    sdk.v1.subscriptions.list.assert_called_once_with(
        {"customer": "cus_owner", "status": "all", "limit": 100}
    )
    assert not get_user_model().objects.filter(pk=user.pk).exists()
    sdk.v1.customers.delete.assert_not_called()


def test_account_export_is_rate_limited_per_user():
    client, _ = account_client()
    for _ in range(3):
        response = client.get("/api/v1/me/export/")
        assert response.status_code == 200
        list(response.streaming_content)
    assert client.get("/api/v1/me/export/").status_code == 429
    other_client, _ = account_client("other@example.com")
    response = other_client.get("/api/v1/me/export/")
    assert response.status_code == 200
    list(response.streaming_content)


def make_checkout(
    user: User, session_id: str, *, status: str = "completed"
) -> CheckoutAttempt:
    plan = SubscriptionPlan.objects.get(code="free")
    subscription = Subscription.objects.create(user=user, plan=plan, status="active")
    price = SubscriptionPrice.objects.create(
        plan=plan,
        provider="stripe",
        provider_price_id="price_checkout",
        currency="usd",
        unit_amount=1000,
        billing_interval="month",
    )
    return CheckoutAttempt.objects.create(
        user=user,
        price=price,
        expected_subscription=subscription,
        provider_checkout_session_id=session_id,
        status=status,
    )


@pytest.mark.parametrize("session_status", ["open", "complete", "expired"])
def test_deletion_closes_checkouts_and_finds_subscriptions_before_their_webhook(
    session_status: str,
):
    client, user = account_client()
    make_checkout(user, "cs_owner")
    sdk = MagicMock()
    sdk.v1.checkout.sessions.retrieve.return_value = (
        stripe.checkout.Session.construct_from(
            {
                "id": "cs_owner",
                "client_reference_id": str(user.pk),
                "status": session_status,
                "customer": "cus_owner" if session_status == "complete" else None,
                "subscription": "sub_new" if session_status == "complete" else None,
            },
            key=None,
        )
    )
    sdk.v1.checkout.sessions.expire.return_value = (
        stripe.checkout.Session.construct_from(
            {"id": "cs_owner", "status": "expired"}, key=None
        )
    )
    sdk.v1.subscriptions.retrieve.return_value = stripe.Subscription.construct_from(
        {"id": "sub_new", "customer": "cus_owner", "status": "active"}, key=None
    )
    sdk.v1.subscriptions.list.return_value.auto_paging_iter.return_value = iter([])
    sdk.v1.subscriptions.cancel.return_value = stripe.Subscription.construct_from(
        {"id": "sub_new", "customer": "cus_owner", "status": "canceled"}, key=None
    )
    with patch("apps.subscriptions.services._stripe_client", return_value=sdk):
        response = client.delete(
            "/api/v1/me/", {"password": "account-password-123"}, format="json"
        )
    assert response.status_code == 204
    assert not User.objects.filter(pk=user.pk).exists()
    if session_status == "open":
        sdk.v1.checkout.sessions.expire.assert_called_once_with("cs_owner")
    else:
        sdk.v1.checkout.sessions.expire.assert_not_called()
    if session_status == "complete":
        sdk.v1.subscriptions.cancel.assert_called_once_with(
            "sub_new", {"invoice_now": False, "prorate": False}
        )
    else:
        sdk.v1.subscriptions.cancel.assert_not_called()


def test_stripe_failure_preserves_everything_and_logs_no_provider_details(
    caplog: pytest.LogCaptureFixture,
):
    client, user = account_client()
    BillingCustomer.objects.create(
        user=user, provider="stripe", provider_customer_id="cus_owner"
    )
    MetricEntry.objects.create(
        user=user,
        metric_definition=MetricDefinition.objects.get(slug="body_weight", user=None),
        value=80,
        recorded_at="2026-09-30T08:00:00Z",
    )
    sdk = MagicMock()
    sdk.v1.subscriptions.list.side_effect = RuntimeError(
        "private@example.com secret-provider-body"
    )
    with patch("apps.subscriptions.services._stripe_client", return_value=sdk):
        response = client.delete(
            "/api/v1/me/", {"password": "account-password-123"}, format="json"
        )
    assert response.status_code == 502
    assert User.objects.filter(pk=user.pk).exists()
    assert MetricEntry.objects.filter(user=user).exists()
    assert OutstandingToken.objects.filter(user=user).exists()
    assert "secret-provider-body" not in caplog.text + str(response.data)
    assert "private@example.com" not in caplog.text + str(response.data)


def test_retry_skips_already_cancelled_subscription_after_partial_stripe_failure():
    client, user = account_client()
    BillingCustomer.objects.create(
        user=user, provider="stripe", provider_customer_id="cus_owner"
    )
    state = {"sub_one": "active", "sub_two": "past_due"}
    sdk = MagicMock()

    def listed(params: dict[str, str | int]) -> MagicMock:
        page = MagicMock()
        page.auto_paging_iter.return_value = iter(
            [
                stripe.Subscription.construct_from(
                    {"id": key, "customer": "cus_owner", "status": value}, key=None
                )
                for key, value in state.items()
            ]
        )
        return page

    sdk.v1.subscriptions.list.side_effect = listed
    failures = [True, False]

    def cancelled(subscription_id: str, params: dict[str, bool]) -> stripe.Subscription:
        if subscription_id == "sub_two" and failures.pop(0):
            raise RuntimeError("temporary provider failure")
        state[subscription_id] = "canceled"
        return stripe.Subscription.construct_from(
            {"id": subscription_id, "customer": "cus_owner", "status": "canceled"},
            key=None,
        )

    # A second attempt succeeds without cancelling sub_one a second time.
    sdk.v1.subscriptions.cancel.side_effect = cancelled
    with patch("apps.subscriptions.services._stripe_client", return_value=sdk):
        first = client.delete(
            "/api/v1/me/", {"password": "account-password-123"}, format="json"
        )
        assert first.status_code == 502
        assert User.objects.filter(pk=user.pk).exists()
        assert state["sub_one"] == "canceled"
        second = client.delete(
            "/api/v1/me/", {"password": "account-password-123"}, format="json"
        )
    assert second.status_code == 204
    assert [call.args[0] for call in sdk.v1.subscriptions.cancel.call_args_list] == [
        "sub_one",
        "sub_two",
        "sub_two",
    ]


@pytest.mark.parametrize("status", ["pending", "failed"])
def test_checkout_without_provider_receipt_blocks_deletion_for_verification(
    status: str,
):
    client, user = account_client()
    make_checkout(user, "", status=status)
    with patch("apps.subscriptions.services._stripe_client") as sdk:
        response = client.delete(
            "/api/v1/me/", {"password": "account-password-123"}, format="json"
        )
    assert response.status_code == 409
    assert User.objects.filter(pk=user.pk).exists()
    sdk.assert_not_called()


def test_wrong_password_never_calls_stripe():
    client, user = account_client()
    BillingCustomer.objects.create(
        user=user, provider="stripe", provider_customer_id="cus_owner"
    )
    with patch("apps.subscriptions.services._stripe_client") as sdk:
        response = client.delete("/api/v1/me/", {"password": "wrong"}, format="json")
    assert response.status_code == 400
    sdk.assert_not_called()


@pytest.mark.parametrize("provider_result", ["active", "wrong_customer"])
def test_unconfirmed_or_wrong_owner_cancellation_keeps_account(provider_result: str):
    client, user = account_client()
    BillingCustomer.objects.create(
        user=user, provider="stripe", provider_customer_id="cus_owner"
    )
    sdk = MagicMock()
    sdk.v1.subscriptions.list.return_value.auto_paging_iter.return_value = iter(
        [
            stripe.Subscription.construct_from(
                {"id": "sub_owner", "customer": "cus_owner", "status": "active"},
                key=None,
            )
        ]
    )
    sdk.v1.subscriptions.cancel.return_value = stripe.Subscription.construct_from(
        {
            "id": "sub_owner",
            "customer": "cus_other"
            if provider_result == "wrong_customer"
            else "cus_owner",
            "status": "canceled" if provider_result == "wrong_customer" else "active",
        },
        key=None,
    )
    with patch("apps.subscriptions.services._stripe_client", return_value=sdk):
        response = client.delete(
            "/api/v1/me/", {"password": "account-password-123"}, format="json"
        )
    assert response.status_code == 502
    assert User.objects.filter(pk=user.pk).exists()


def test_active_stripe_subscription_without_provider_id_cannot_be_erased():
    client, user = account_client()
    Subscription.objects.create(
        user=user,
        plan=SubscriptionPlan.objects.get(code="free"),
        status="active",
        provider="stripe",
    )
    with patch("apps.subscriptions.services._stripe_client") as sdk:
        response = client.delete(
            "/api/v1/me/", {"password": "account-password-123"}, format="json"
        )
    assert response.status_code == 502
    assert User.objects.filter(pk=user.pk).exists()
    sdk.assert_not_called()


def test_deleted_account_is_a_stale_transition_for_delayed_billing_events():
    client, user = account_client()
    plan = SubscriptionPlan.objects.get(code="free")
    subscription = Subscription.objects.create(user=user, plan=plan, status="active")
    assert (
        client.delete(
            "/api/v1/me/", {"password": "account-password-123"}, format="json"
        ).status_code
        == 204
    )
    with pytest.raises(StaleSubscriptionTransitionError):
        change_subscription_plan(
            user=user, plan=plan, price=None, expected_subscription_id=subscription.pk
        )


def test_subscription_owned_by_a_different_customer_is_never_cancelled():
    client, user = account_client()
    BillingCustomer.objects.create(
        user=user, provider="stripe", provider_customer_id="cus_owner"
    )
    Subscription.objects.create(
        user=user,
        plan=SubscriptionPlan.objects.get(code="free"),
        status="active",
        provider="stripe",
        provider_subscription_id="sub_bad_reference",
    )
    sdk = MagicMock()
    sdk.v1.subscriptions.retrieve.return_value = stripe.Subscription.construct_from(
        {
            "id": "sub_bad_reference",
            "customer": "cus_other",
            "status": "active",
        },
        key=None,
    )
    with patch("apps.subscriptions.services._stripe_client", return_value=sdk):
        response = client.delete(
            "/api/v1/me/", {"password": "account-password-123"}, format="json"
        )
    assert response.status_code == 502
    assert User.objects.filter(pk=user.pk).exists()
    sdk.v1.subscriptions.cancel.assert_not_called()


def test_deletion_cancels_historical_customers_proven_by_owned_checkouts():
    client, user = account_client()
    BillingCustomer.objects.create(
        user=user, provider="stripe", provider_customer_id="cus_current"
    )
    attempt = make_checkout(user, "cs_old")
    CheckoutAttempt.objects.create(
        user=user,
        price=attempt.price,
        expected_subscription=attempt.expected_subscription,
        provider_checkout_session_id="cs_current",
        status="confirmed",
    )
    sdk = MagicMock()
    customers = {"cs_old": "cus_old", "cs_current": "cus_current"}
    subscriptions = {"sub_old": "cus_old", "sub_current": "cus_current"}
    sdk.v1.checkout.sessions.retrieve.side_effect = lambda key: (
        stripe.checkout.Session.construct_from(
            {
                "id": key,
                "client_reference_id": str(user.pk),
                "status": "complete",
                "customer": customers[key],
                "subscription": key.replace("cs_", "sub_"),
            },
            key=None,
        )
    )
    sdk.v1.subscriptions.retrieve.side_effect = lambda key: (
        stripe.Subscription.construct_from(
            {"id": key, "customer": subscriptions[key], "status": "active"}, key=None
        )
    )
    sdk.v1.subscriptions.list.return_value.auto_paging_iter.return_value = iter([])
    sdk.v1.subscriptions.cancel.side_effect = lambda key, params: (
        stripe.Subscription.construct_from(
            {"id": key, "customer": subscriptions[key], "status": "canceled"}, key=None
        )
    )
    with patch("apps.subscriptions.services._stripe_client", return_value=sdk):
        response = client.delete(
            "/api/v1/me/", {"password": "account-password-123"}, format="json"
        )
    assert response.status_code == 204
    assert {call.args[0] for call in sdk.v1.subscriptions.cancel.call_args_list} == set(
        subscriptions
    )
    assert {
        call.args[0]["customer"] for call in sdk.v1.subscriptions.list.call_args_list
    } == set(customers.values())
    assert not User.objects.filter(pk=user.pk).exists()


@pytest.mark.parametrize(
    "conflict",
    ["another_account", "wrong_session_owner", "wrong_subscription_customer"],
)
def test_historical_checkout_discovery_rejects_ownership_conflicts(conflict: str):
    client, user = account_client()
    BillingCustomer.objects.create(
        user=user, provider="stripe", provider_customer_id="cus_current"
    )
    make_checkout(user, "cs_old")
    if conflict == "another_account":
        _, other = account_client("billing-other@example.com")
        BillingCustomer.objects.create(
            user=other, provider="stripe", provider_customer_id="cus_old"
        )
    sdk = MagicMock()
    sdk.v1.checkout.sessions.retrieve.return_value = (
        stripe.checkout.Session.construct_from(
            {
                "id": "cs_old",
                "client_reference_id": "wrong-owner"
                if conflict == "wrong_session_owner"
                else str(user.pk),
                "status": "complete",
                "customer": "cus_old",
                "subscription": "sub_old",
            },
            key=None,
        )
    )
    sdk.v1.subscriptions.retrieve.return_value = stripe.Subscription.construct_from(
        {
            "id": "sub_old",
            "customer": "cus_current"
            if conflict == "wrong_subscription_customer"
            else "cus_old",
            "status": "active",
        },
        key=None,
    )
    with patch("apps.subscriptions.services._stripe_client", return_value=sdk):
        response = client.delete(
            "/api/v1/me/", {"password": "account-password-123"}, format="json"
        )
    assert response.status_code == 502
    assert User.objects.filter(pk=user.pk).exists()
    sdk.v1.subscriptions.cancel.assert_not_called()
    sdk.v1.subscriptions.list.assert_not_called()


def test_unconfirmed_checkout_expiration_preserves_account():
    client, user = account_client()
    make_checkout(user, "cs_owner")
    sdk = MagicMock()
    sdk.v1.checkout.sessions.retrieve.return_value = (
        stripe.checkout.Session.construct_from(
            {
                "id": "cs_owner",
                "client_reference_id": str(user.pk),
                "status": "open",
            },
            key=None,
        )
    )
    sdk.v1.checkout.sessions.expire.return_value = (
        stripe.checkout.Session.construct_from(
            {"id": "cs_owner", "status": "open"}, key=None
        )
    )
    with patch("apps.subscriptions.services._stripe_client", return_value=sdk):
        response = client.delete(
            "/api/v1/me/", {"password": "account-password-123"}, format="json"
        )
    assert response.status_code == 502
    assert User.objects.filter(pk=user.pk).exists()
    sdk.v1.subscriptions.cancel.assert_not_called()
