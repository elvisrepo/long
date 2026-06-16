import pytest
from rest_framework.test import APIClient
from django.contrib.auth import get_user_model
from rest_framework_simplejwt.tokens import RefreshToken

from apps.subscriptions.models import SubscriptionPlan, SubscriptionPrice

pytestmark = pytest.mark.django_db

def test_subscription_checkout_requires_authentication():
      response = APIClient().post(
          "/api/v1/subscriptions/checkout/",
          {"price_id": "00000000-0000-0000-0000-000000000000"},
          format="json",
      )

      assert response.status_code == 401


def test_subscription_checkout_requires_price_id():
      user = get_user_model().objects.create_user(
          email="alice@example.com",
          password="strong-password-123",
      )
      client = APIClient()
      access_token = RefreshToken.for_user(user).access_token
      client.credentials(HTTP_AUTHORIZATION=f"Bearer {access_token}")

      response = client.post(
          "/api/v1/subscriptions/checkout/",
          {},
          format="json",
      )

      assert response.status_code == 400
      assert response.json() == {
          "price_id": ["This field is required."],
      }

def test_subscription_checkout_rejects_inactive_price():
      user = get_user_model().objects.create_user(
          email="alice@example.com",
          password="strong-password-123",
      )
      client = APIClient()
      access_token = RefreshToken.for_user(user).access_token
      client.credentials(HTTP_AUTHORIZATION=f"Bearer {access_token}")

      plan = SubscriptionPlan.objects.create(
          code="pro-checkout",
          name="Pro",
          active_custom_metric_limit=10,
          wearable_connection_limit=2,
          sync_interval_minutes=15,
      )

      inactive_price = SubscriptionPrice.objects.create(
          plan=plan,
          provider=SubscriptionPrice.Provider.STRIPE,
          provider_price_id="price_inactive",
          currency="usd",
          unit_amount=1000,
          billing_interval=SubscriptionPrice.BillingInterval.MONTH,
          is_active=False,
      )

      response = client.post(
          "/api/v1/subscriptions/checkout/",
          {"price_id": str(inactive_price.id)},
          format="json",
      )

      assert response.status_code == 400
      assert "price_id" in response.json()