from datetime import UTC, datetime

import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from apps.subscriptions.models import (
    BillingCustomer,
    Subscription,
    SubscriptionPlan,
    SubscriptionPrice,
)


pytestmark = pytest.mark.django_db


def authenticate_client_for(email: str) -> tuple[APIClient, object]:
    client = APIClient()
    user = get_user_model().objects.create_user(
        email=email,
        password="strong-password-123",
    )
    access_token = RefreshToken.for_user(user).access_token
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {access_token}")
    return client, user


def test_current_subscription_requires_authentication():
    response = APIClient().get("/api/v1/subscriptions/current/")

    assert response.status_code == 401


def test_current_subscription_returns_authenticated_users_plan_and_entitlements():
    client, user = authenticate_client_for("alice@example.com")
    free_plan = SubscriptionPlan.objects.get(code="free")
    subscription = Subscription.objects.create(
        user=user,
        plan=free_plan,
        status=Subscription.Status.ACTIVE,
    )

    response = client.get("/api/v1/subscriptions/current/")

    assert response.status_code == 200
    assert response.json() == {
        "id": str(subscription.id),
        "status": "active",
        "billing_portal_available": False,
        "current_period_start": None,
        "current_period_end": None,
        "cancel_at": None,
        "cancel_at_period_end": False,
        "price": None,
        "plan": {
            "code": "free",
            "name": "Free",
            "active_custom_metric_limit": 3,
            "wearable_connection_limit": 1,
            "automatic_sync_enabled": False,
            "sync_interval_minutes": 30,
            "analytics_enabled": False,
            "csv_import_enabled": False,
        },
    }


def test_current_subscription_exposes_portal_when_stripe_customer_exists():
    client, user = authenticate_client_for("portal-customer@example.com")
    free_plan = SubscriptionPlan.objects.get(code="free")
    Subscription.objects.create(
        user=user,
        plan=free_plan,
        status=Subscription.Status.ACTIVE,
    )
    BillingCustomer.objects.create(
        user=user,
        provider=BillingCustomer.Provider.STRIPE,
        provider_customer_id="cus_current_subscription",
    )

    response = client.get("/api/v1/subscriptions/current/")

    assert response.status_code == 200
    assert response.json()["billing_portal_available"] is True


def test_current_subscription_returns_billing_state_for_paid_subscription():
    client, user = authenticate_client_for("paid-billing-state@example.com")
    pro_plan = SubscriptionPlan.objects.create(
        code="pro-current-billing-state",
        name="Pro",
        active_custom_metric_limit=10,
        wearable_connection_limit=2,
        automatic_sync_enabled=True,
        sync_interval_minutes=15,
        analytics_enabled=True,
        csv_import_enabled=True,
    )
    price = SubscriptionPrice.objects.create(
        plan=pro_plan,
        provider=SubscriptionPrice.Provider.STRIPE,
        provider_price_id="price_current_billing_state",
        currency="usd",
        unit_amount=1000,
        billing_interval=SubscriptionPrice.BillingInterval.MONTH,
    )
    current_period_start = datetime(2026, 7, 2, tzinfo=UTC)
    current_period_end = datetime(2026, 8, 2, tzinfo=UTC)
    cancel_at = datetime(2026, 8, 2, tzinfo=UTC)

    subscription = Subscription.objects.create(
        user=user,
        plan=pro_plan,
        price=price,
        status=Subscription.Status.ACTIVE,
        provider=SubscriptionPrice.Provider.STRIPE,
        provider_subscription_id="sub_current_billing_state",
        current_period_start=current_period_start,
        current_period_end=current_period_end,
        cancel_at=cancel_at,
        cancel_at_period_end=True,
    )
    BillingCustomer.objects.create(
        user=user,
        provider=BillingCustomer.Provider.STRIPE,
        provider_customer_id="cus_current_billing_state",
    )

    response = client.get("/api/v1/subscriptions/current/")

    assert response.status_code == 200
    assert response.json() == {
        "id": str(subscription.id),
        "status": "active",
        "billing_portal_available": True,
        "current_period_start": "2026-07-02T00:00:00Z",
        "current_period_end": "2026-08-02T00:00:00Z",
        "cancel_at": "2026-08-02T00:00:00Z",
        "cancel_at_period_end": True,
        "price": {
            "currency": "usd",
            "unit_amount": 1000,
            "billing_interval": "month",
        },
        "plan": {
            "code": "pro-current-billing-state",
            "name": "Pro",
            "active_custom_metric_limit": 10,
            "wearable_connection_limit": 2,
            "automatic_sync_enabled": True,
            "sync_interval_minutes": 15,
            "analytics_enabled": True,
            "csv_import_enabled": True,
        },
    }


def test_current_subscription_is_scoped_to_authenticated_user():
    client, user = authenticate_client_for("alice@example.com")
    other_user = get_user_model().objects.create_user(
        email="bob@example.com",
        password="strong-password-123",
    )
    free_plan = SubscriptionPlan.objects.get(code="free")
    pro_plan = SubscriptionPlan.objects.create(
        code="pro-current-endpoint",
        name="Pro",
        active_custom_metric_limit=10,
        wearable_connection_limit=2,
        sync_interval_minutes=15,
        analytics_enabled=True,
        csv_import_enabled=True,
    )
    Subscription.objects.create(
        user=user,
        plan=free_plan,
        status=Subscription.Status.ACTIVE,
    )
    Subscription.objects.create(
        user=other_user,
        plan=pro_plan,
        status=Subscription.Status.ACTIVE,
    )

    response = client.get("/api/v1/subscriptions/current/")

    assert response.status_code == 200
    assert response.json()["plan"]["code"] == "free"

def test_current_subscription_does_not_allow_client_plan_changes():
      client, user = authenticate_client_for("alice@example.com")
      free_plan = SubscriptionPlan.objects.get(code="free")
      subscription = Subscription.objects.create(
          user=user,
          plan=free_plan,
          status=Subscription.Status.ACTIVE,
      )

      response = client.patch(
          "/api/v1/subscriptions/current/",
          {
              "plan_code": "pro",
              "expected_subscription_id": str(subscription.id),
          },
          format="json",
      )

      assert response.status_code == 405
