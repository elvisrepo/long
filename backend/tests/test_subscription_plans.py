import pytest
from rest_framework.test import APIClient

from apps.subscriptions.models import SubscriptionPlan


pytestmark = pytest.mark.django_db

def test_subscription_plan_catalog_returns_only_active_plans():
      SubscriptionPlan.objects.create(
          code="pro",
          name="Pro",
          active_custom_metric_limit=10,
          wearable_connection_limit=2,
          sync_interval_minutes=15,
          analytics_enabled=True,
          csv_import_enabled=True,
          is_default=False,
          is_active=True,
      )
      SubscriptionPlan.objects.create(
          code="retired",
          name="Retired",
          active_custom_metric_limit=5,
          wearable_connection_limit=1,
          sync_interval_minutes=30,
          is_default=False,
          is_active=False,
      )

      response = APIClient().get("/api/v1/subscriptions/plans/")

      assert response.status_code == 200
      assert response.json() == [
          {
              "code": "free",
              "name": "Free",
              "active_custom_metric_limit": 3,
              "wearable_connection_limit": 0,
              "sync_interval_minutes": 60,
              "analytics_enabled": False,
              "csv_import_enabled": False,
              "is_default": True,
          },
          {
              "code": "pro",
              "name": "Pro",
              "active_custom_metric_limit": 10,
              "wearable_connection_limit": 2,
              "sync_interval_minutes": 15,
              "analytics_enabled": True,
              "csv_import_enabled": True,
              "is_default": False,
          },
      ]