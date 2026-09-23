import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken
from apps.subscriptions.models import Subscription, SubscriptionPlan

from apps.metrics.models import MetricDefinition

pytestmark = pytest.mark.django_db


def authenticate_client_for(email: str) -> tuple[APIClient, object]:
      client = APIClient()
      user = get_user_model().objects.create_user(
          email=email,
          password="strong-password-123",
      )

      refresh = RefreshToken.for_user(user)
      client.credentials(HTTP_AUTHORIZATION=f"Bearer {refresh.access_token}")
      return client, user


def test_metric_usage_returns_active_custom_metric_usage():
      client, user = authenticate_client_for("alice@example.com")

      free_plan = SubscriptionPlan.objects.get(code="free")
      Subscription.objects.create(
          user=user,
          plan=free_plan,
          status=Subscription.Status.ACTIVE,
      )

      MetricDefinition.objects.create(
          user=user,
          name="Mood",
          slug="mood",
          unit="score",
          category=MetricDefinition.Category.CUSTOM,
          min_value=1,
          max_value=10,
          is_default=False,
          is_active=True,
      )
      MetricDefinition.objects.create(
          user=user,
          name="Energy",
          slug="energy",
          unit="score",
          category=MetricDefinition.Category.CUSTOM,
          min_value=1,
          max_value=10,
          is_default=False,
          is_active=True,
      )

      response = client.get("/api/v1/metrics/usage/")

      assert response.status_code == 200
      assert response.json() == {
          "active_custom_metrics": {
              "used": 2,
              "limit": 3,
          }
      }

def test_metric_usage_returns_limit_from_current_subscription_plan():
      client, user = authenticate_client_for("pro@example.com")
      pro_plan = SubscriptionPlan.objects.create(
          code="pro",
          name="Pro",
          active_custom_metric_limit=10,
          wearable_connection_limit=2,
          sync_interval_minutes=15,
      )
      Subscription.objects.create(
          user=user,
          plan=pro_plan,
          status=Subscription.Status.ACTIVE,
      )

      response = client.get("/api/v1/metrics/usage/")

      assert response.status_code == 200
      assert response.json() == {
          "active_custom_metrics": {
              "used": 0,
              "limit": 10,
          }
      }