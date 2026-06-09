import pytest
from django.contrib.auth import get_user_model

from apps.subscriptions.models import Subscription, SubscriptionPlan
from apps.subscriptions.services import get_current_subscription_plan

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