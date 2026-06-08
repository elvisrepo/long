import pytest

from apps.subscriptions.models import SubscriptionPlan


pytestmark = pytest.mark.django_db

def test_subscription_plan_stores_entitlement_limits():
      plan = SubscriptionPlan.objects.create(
          code="free",
          name="Free",
          active_custom_metric_limit=3,
          wearable_connection_limit=0,
          sync_interval_minutes=60,
          analytics_enabled=False,
          csv_import_enabled=False,
          is_default=True,
          is_active=True,
      )

      assert plan.code == "free"
      assert plan.active_custom_metric_limit == 3
      assert plan.wearable_connection_limit == 0
      assert plan.sync_interval_minutes == 60
      assert plan.is_default is True
      assert plan.is_active is True