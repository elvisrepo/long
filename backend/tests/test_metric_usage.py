import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

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