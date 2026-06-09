import pytest
from django.contrib.auth import get_user_model

from apps.subscriptions.models import Subscription, SubscriptionPlan
from apps.subscriptions.services import (
      change_subscription_plan,
      get_current_subscription_plan,
  )

pytestmark = pytest.mark.django_db


def test_get_current_subscription_plan_returns_users_active_plan():
      user = get_user_model().objects.create_user(
          email="alice@example.com",
          password="strong-password-123",
      )
      free_plan = SubscriptionPlan.objects.get(code="free")
      Subscription.objects.create(
          user=user,
          plan=free_plan,
          status=Subscription.Status.ACTIVE,
      )

      result = get_current_subscription_plan(user)

      assert result == free_plan

def test_get_current_subscription_plan_ignores_cancelled_subscription():
      user = get_user_model().objects.create_user(
          email="cancelled@example.com",
          password="strong-password-123",
      )
      free_plan = SubscriptionPlan.objects.get(code="free")
      Subscription.objects.create(
          user=user,
          plan=free_plan,
          status=Subscription.Status.CANCELLED,
      )

      with pytest.raises(Subscription.DoesNotExist):
          get_current_subscription_plan(user)

def test_change_subscription_plan_preserves_history():
      user = get_user_model().objects.create_user(
          email="upgrade@example.com",
          password="strong-password-123",
      )
      free_plan = SubscriptionPlan.objects.get(code="free")
      pro_plan = SubscriptionPlan.objects.create(
          code="pro",
          name="Pro",
          active_custom_metric_limit=10,
          wearable_connection_limit=2,
          sync_interval_minutes=15,
      )
      free_subscription = Subscription.objects.create(
          user=user,
          plan=free_plan,
          status=Subscription.Status.ACTIVE,
      )

      new_subscription = change_subscription_plan(
          user=user,
          plan=pro_plan,
      )

      free_subscription.refresh_from_db()

      assert free_subscription.status == Subscription.Status.CANCELLED
      assert free_subscription.cancelled_at is not None
      assert new_subscription.user == user
      assert new_subscription.plan == pro_plan
      assert new_subscription.status == Subscription.Status.ACTIVE
      assert Subscription.objects.filter(user=user).count() == 2