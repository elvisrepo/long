import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from apps.subscriptions.models import Subscription, SubscriptionPlan


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
        "plan": {
            "code": "free",
            "name": "Free",
            "active_custom_metric_limit": 3,
            "wearable_connection_limit": 0,
            "sync_interval_minutes": 60,
            "analytics_enabled": False,
            "csv_import_enabled": False,
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

