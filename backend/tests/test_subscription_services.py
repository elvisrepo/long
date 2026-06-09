import pytest
from django.contrib.auth import get_user_model
from unittest.mock import patch

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

def test_change_subscription_plan_rolls_back_when_replacement_creation_fails():
      user = get_user_model().objects.create_user(
          email="rollback-upgrade@example.com",
          password="strong-password-123",
      )
      free_plan = SubscriptionPlan.objects.get(code="free")
      pro_plan = SubscriptionPlan.objects.create(
          code="pro-rollback",
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

      # simulate DB failure while creating the replacement subscription.
      '''
        patch.object() temporarily replaces:
        Subscription.objects.create
        with a mock that raises:
        RuntimeError("replacement failed"

        Therefore, when production code reaches:

        Subscription.objects.create(
            user=user,
            plan=plan,
            status=Subscription.Status.ACTIVE,
        )

        it raises instead of creating the Pro subscription.
      '''
      with patch.object(
          Subscription.objects,
          "create",
          side_effect=RuntimeError("replacement failed"),
      ):
          with pytest.raises(RuntimeError, match="replacement failed"):
              change_subscription_plan(
                  user=user,
                  plan=pro_plan,
              )

      free_subscription.refresh_from_db()

      assert free_subscription.status == Subscription.Status.ACTIVE
      assert free_subscription.cancelled_at is None
      assert Subscription.objects.filter(user=user).count() == 1






'''
Begin transaction
  → lock user
  → mark Free subscription cancelled
  → save cancellation
  → attempt to create Pro subscription
  → mocked create raises RuntimeError
  → transaction.atomic rolls back
  → Free subscription becomes active again
  → no Pro subscription exists

'''