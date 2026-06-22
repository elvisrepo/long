import pytest
from django.contrib.auth import get_user_model
from django.core.management import call_command

from apps.subscriptions.models import Subscription, SubscriptionPlan

pytestmark = pytest.mark.django_db


def test_backfill_free_subscriptions_dry_run_does_not_create_subscriptions():
    user = get_user_model().objects.create_user(
        email="missing-subscription@example.com",
        password="strong-password-123",
    )

    call_command("backfill_free_subscriptions", "--dry-run")

    assert Subscription.objects.filter(user=user).count() == 0


def test_backfill_free_subscriptions_creates_free_subscription_for_missing_user():
    user = get_user_model().objects.create_user(
        email="backfill-missing-subscription@example.com",
        password="strong-password-123",
    )
    free_plan = SubscriptionPlan.objects.get(code="free")

    call_command("backfill_free_subscriptions")

    subscription = Subscription.objects.get(user=user)

    assert subscription.plan == free_plan
    assert subscription.status == Subscription.Status.ACTIVE


def test_backfill_free_subscriptions_does_not_create_duplicate_current_subscription():
    user = get_user_model().objects.create_user(
        email="already-subscribed@example.com",
        password="strong-password-123",
    )
    free_plan = SubscriptionPlan.objects.get(code="free")
    Subscription.objects.create(
        user=user,
        plan=free_plan,
        status=Subscription.Status.ACTIVE,
    )

    call_command("backfill_free_subscriptions")

    assert Subscription.objects.filter(user=user).count() == 1
