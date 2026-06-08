import pytest

from apps.subscriptions.models import Subscription, SubscriptionPlan
from django.contrib.auth import get_user_model


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

def test_subscription_assigns_a_plan_to_a_user():
      user = get_user_model().objects.create_user(
          email="alice@example.com",
          password="strong-password-123",
      )

      plan = SubscriptionPlan.objects.create(
          code="free",
          name="Free",
          active_custom_metric_limit=3,
          wearable_connection_limit=0,
          sync_interval_minutes=60,
          is_default=True,
      )

      subscription = Subscription.objects.create(
            user=user,
            plan=plan,
            status=Subscription.Status.ACTIVE,
      )

      assert subscription.user == user
      assert subscription.plan == plan
      assert subscription.status == Subscription.Status.ACTIVE
      assert subscription.provider_subscription_id is None