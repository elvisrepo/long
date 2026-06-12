import pytest
from django.contrib.auth import get_user_model
from unittest.mock import patch

from apps.subscriptions.models import (
      Subscription,
      SubscriptionPlan,
      SubscriptionPrice,
  )
from apps.subscriptions.services import (
      StaleSubscriptionTransitionError,
      change_subscription_plan,
      get_current_subscription_plan,
  )

from django.core.exceptions import ValidationError

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
          expected_subscription_id=free_subscription.id,
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
                  expected_subscription_id=free_subscription.id,
              )

      free_subscription.refresh_from_db()

      assert free_subscription.status == Subscription.Status.ACTIVE
      assert free_subscription.cancelled_at is None
      assert Subscription.objects.filter(user=user).count() == 1


def test_change_subscription_plan_rejects_stale_expected_subscription():
      user = get_user_model().objects.create_user(
          email="stale-upgrade@example.com",
          password="strong-password-123",
      )
      free_plan = SubscriptionPlan.objects.get(code="free")
      pro_plan = SubscriptionPlan.objects.create(
          code="pro-stale",
          name="Pro",
          active_custom_metric_limit=10,
          wearable_connection_limit=2,
          sync_interval_minutes=15,
      )
      premium_plan = SubscriptionPlan.objects.create(
          code="premium-stale",
          name="Premium",
          active_custom_metric_limit=25,
          wearable_connection_limit=5,
          sync_interval_minutes=5,
      )
      free_subscription = Subscription.objects.create(
          user=user,
          plan=free_plan,
          status=Subscription.Status.ACTIVE,
      )
      stale_subscription = Subscription.objects.create(
          user=user,
          plan=pro_plan,
          status=Subscription.Status.CANCELLED,
      )

      with pytest.raises(StaleSubscriptionTransitionError):
          change_subscription_plan(
              user=user,
              plan=premium_plan,
              expected_subscription_id=stale_subscription.id,
          )

      free_subscription.refresh_from_db()

      assert free_subscription.status == Subscription.Status.ACTIVE
      assert free_subscription.cancelled_at is None
      assert Subscription.objects.filter(user=user).count() == 2


def test_change_subscription_plan_stores_selected_price():
    user = get_user_model().objects.create_user(
          email="priced-upgrade@example.com",
          password="strong-password-123",
      )
    free_plan = SubscriptionPlan.objects.get(code="free")
    pro_plan = SubscriptionPlan.objects.create(
          code="pro-priced-upgrade",
          name="Pro",
          active_custom_metric_limit=10,
          wearable_connection_limit=2,
          sync_interval_minutes=15,
      )
    
    monthly_price = SubscriptionPrice.objects.create(
          plan=pro_plan,
          provider=SubscriptionPrice.Provider.STRIPE,
          provider_price_id="price_pro_upgrade_monthly",
          currency="usd",
          unit_amount=1000,
          billing_interval=SubscriptionPrice.BillingInterval.MONTH,
    )

    free_subscription = Subscription.objects.create(
          user=user,
          plan=free_plan,
          status=Subscription.Status.ACTIVE,
      )
    
    new_subscription = change_subscription_plan(
          user=user,
          plan=pro_plan,
          price=monthly_price,
          expected_subscription_id=free_subscription.id,
      )

    assert new_subscription.plan == pro_plan
    assert new_subscription.price == monthly_price

def test_change_subscription_plan_rejects_price_from_another_plan():
      user = get_user_model().objects.create_user(
          email="mismatched-upgrade@example.com",
          password="strong-password-123",
      )
      free_plan = SubscriptionPlan.objects.get(code="free")
      pro_plan = SubscriptionPlan.objects.create(
          code="pro-mismatched-upgrade",
          name="Pro",
          active_custom_metric_limit=10,
          wearable_connection_limit=2,
          sync_interval_minutes=15,
      )
      premium_plan = SubscriptionPlan.objects.create(
          code="premium-mismatched-upgrade",
          name="Premium",
          active_custom_metric_limit=25,
          wearable_connection_limit=5,
          sync_interval_minutes=5,
      )

      premium_price = SubscriptionPrice.objects.create(
          plan=premium_plan,
          provider=SubscriptionPrice.Provider.STRIPE,
          provider_price_id="price_premium_mismatched_upgrade",
          currency="usd",
          unit_amount=2000,
          billing_interval=SubscriptionPrice.BillingInterval.MONTH,
      )

      free_subscription = Subscription.objects.create(
           user=user,
           plan=free_plan,
           status=Subscription.Status.ACTIVE,
      )
      
      with pytest.raises(ValidationError):
          change_subscription_plan(
              user=user,
              plan=pro_plan,
              price=premium_price,
              expected_subscription_id=free_subscription.id,
          )

      free_subscription.refresh_from_db()

      assert free_subscription.status == Subscription.Status.ACTIVE
      assert Subscription.objects.filter(user=user).count() == 1

def test_change_subscription_plan_rejects_inactive_price():
    user = get_user_model().objects.create_user(
          email="inactive-price-upgrade@example.com",
          password="strong-password-123",
      )
    free_plan = SubscriptionPlan.objects.get(code="free")
    pro_plan = SubscriptionPlan.objects.create(
          code="pro-inactive-price",
          name="Pro",
          active_custom_metric_limit=10,
          wearable_connection_limit=2,
          sync_interval_minutes=15,
      )
    inactive_price = SubscriptionPrice.objects.create(
          plan=pro_plan,
          provider=SubscriptionPrice.Provider.STRIPE,
          provider_price_id="price_pro_inactive",
          currency="usd",
          unit_amount=1000,
          billing_interval=SubscriptionPrice.BillingInterval.MONTH,
          is_active=False,
      )
    free_subscription = Subscription.objects.create(
          user=user,
          plan=free_plan,
          status=Subscription.Status.ACTIVE,
      )

    with pytest.raises(
          ValidationError,
          match="The selected price is not active.",
      ):
          change_subscription_plan(
              user=user,
              plan=pro_plan,
              price=inactive_price,
              expected_subscription_id=free_subscription.id,
          )

    free_subscription.refresh_from_db()

    assert free_subscription.status == Subscription.Status.ACTIVE
    assert Subscription.objects.filter(user=user).count() == 1

def test_change_subscription_plan_requires_price_for_paid_plan():
    user = get_user_model().objects.create_user(
          email="missing-price-upgrade@example.com",
          password="strong-password-123",
      )
    free_plan = SubscriptionPlan.objects.get(code="free")
    pro_plan = SubscriptionPlan.objects.create(
          code="pro-missing-price",
          name="Pro",
          active_custom_metric_limit=10,
          wearable_connection_limit=2,
          sync_interval_minutes=15,
          is_default=False,
      )
    
    free_subscription = Subscription.objects.create(
          user=user,
          plan=free_plan,
          status=Subscription.Status.ACTIVE,
      )
    
    with pytest.raises(
          ValidationError,
          match="A price is required for a paid plan.",
      ):
          change_subscription_plan(
              user=user,
              plan=pro_plan,
              price=None,
              expected_subscription_id=free_subscription.id,
          )

    free_subscription.refresh_from_db()

    assert free_subscription.status == Subscription.Status.ACTIVE
    assert Subscription.objects.filter(user=user).count() == 1

def test_change_subscription_plan_allows_default_plan_without_price():
      user = get_user_model().objects.create_user(
          email="free-downgrade@example.com",
          password="strong-password-123",
      )
      free_plan = SubscriptionPlan.objects.get(code="free")
      pro_plan = SubscriptionPlan.objects.create(
          code="pro-free-downgrade",
          name="Pro",
          active_custom_metric_limit=10,
          wearable_connection_limit=2,
          sync_interval_minutes=15,
      )
      pro_price = SubscriptionPrice.objects.create(
          plan=pro_plan,
          provider=SubscriptionPrice.Provider.STRIPE,
          provider_price_id="price_pro_free_downgrade",
          currency="usd",
          unit_amount=1000,
          billing_interval=SubscriptionPrice.BillingInterval.MONTH,
      )
      pro_subscription = Subscription.objects.create(
          user=user,
          plan=pro_plan,
          price=pro_price,
          status=Subscription.Status.ACTIVE,
      )

      free_subscription = change_subscription_plan(
          user=user,
          plan=free_plan,
          price=None,
          expected_subscription_id=pro_subscription.id,
      )

      pro_subscription.refresh_from_db()

      assert pro_subscription.status == Subscription.Status.CANCELLED
      assert free_subscription.plan == free_plan
      assert free_subscription.price is None
      assert free_subscription.status == Subscription.Status.ACTIVE   


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
