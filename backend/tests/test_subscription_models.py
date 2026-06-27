from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.db import IntegrityError, transaction

import pytest

from apps.subscriptions.models import (
    BillingCustomer,
    Subscription,
    SubscriptionPlan,
    SubscriptionPrice,
    CheckoutAttempt
)


pytestmark = pytest.mark.django_db


def test_subscription_plan_stores_entitlement_limits():
    # The migration reserves "free"; this test creates an independent row so
    # it verifies model persistence rather than duplicating seed behavior.
    plan = SubscriptionPlan.objects.create(
        code="starter",
        name="Starter",
        active_custom_metric_limit=3,
        wearable_connection_limit=0,
        sync_interval_minutes=60,
        analytics_enabled=False,
        csv_import_enabled=False,
        is_default=True,
        is_active=True,
    )

    assert plan.code == "starter"
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
        code="pro",
        name="Pro",
        active_custom_metric_limit=10,
        wearable_connection_limit=2,
        sync_interval_minutes=15,
        is_default=False,
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


def test_default_free_plan_is_seeded():
    # pytest-django builds the test database by applying migrations, so finding
    # this row proves the data migration ran successfully.
    plan = SubscriptionPlan.objects.get(code="free")

    assert plan.name == "Free"
    assert plan.active_custom_metric_limit == 3
    assert plan.wearable_connection_limit == 0
    assert plan.sync_interval_minutes == 60
    assert plan.analytics_enabled is False
    assert plan.csv_import_enabled is False
    assert plan.is_default is True
    assert plan.is_active is True


def test_user_cannot_have_multiple_current_subscriptions():
    user = get_user_model().objects.create_user(
        email="alice-current@example.com",
        password="strong-password-123",
    )
    free_plan = SubscriptionPlan.objects.get(code="free")

    Subscription.objects.create(
        user=user,
        plan=free_plan,
        status=Subscription.Status.ACTIVE,
    )

    with pytest.raises(IntegrityError):
        # Isolate the expected database error so it does not break the outer
        # transaction managed by pytest-django.
        with transaction.atomic():
            Subscription.objects.create(
                user=user,
                plan=free_plan,
                status=Subscription.Status.TRIALING,
            )

    assert Subscription.objects.filter(user=user).count() == 1


def test_subscription_plan_supports_multiple_billing_prices():

    pro_plan = SubscriptionPlan.objects.create(
        code="pro-pricing",
        name="Pro",
        active_custom_metric_limit=10,
        wearable_connection_limit=2,
        sync_interval_minutes=15,
    )

    monthly_price = SubscriptionPrice.objects.create(
        plan=pro_plan,
        provider="stripe",
        provider_price_id="price_pro_monthly",
        currency="usd",
        unit_amount=1000,
        billing_interval=SubscriptionPrice.BillingInterval.MONTH,
        is_active=True,
    )

    yearly_price = SubscriptionPrice.objects.create(
        plan=pro_plan,
        provider="stripe",
        provider_price_id="price_pro_yearly",
        currency="usd",
        unit_amount=10000,
        billing_interval=SubscriptionPrice.BillingInterval.YEAR,
        is_active=True,
    )

    assert list(pro_plan.prices.order_by("unit_amount")) == [
        monthly_price,
        yearly_price,
    ]


def test_subscription_selects_one_price_from_its_plan():
    user = get_user_model().objects.create_user(
        email="priced-subscription@example.com",
        password="strong-password-123",
    )

    pro_plan = SubscriptionPlan.objects.create(
        code="pro-pricing",
        name="Pro",
        active_custom_metric_limit=10,
        wearable_connection_limit=2,
        sync_interval_minutes=15,
    )

    monthly_price = SubscriptionPrice.objects.create(
        plan=pro_plan,
        provider="stripe",
        provider_price_id="price_pro_monthly",
        currency="usd",
        unit_amount=1000,
        billing_interval=SubscriptionPrice.BillingInterval.MONTH,
        is_active=True,
    )
    yearly_price = SubscriptionPrice.objects.create(
        plan=pro_plan,
        provider="stripe",
        provider_price_id="price_pro_yearly",
        currency="usd",
        unit_amount=10000,
        billing_interval=SubscriptionPrice.BillingInterval.YEAR,
        is_active=True,
    )

    subscription = Subscription.objects.create(
        user=user,
        plan=pro_plan,
        price=monthly_price,
        status=Subscription.Status.ACTIVE,
    )

    assert subscription.price == monthly_price
    assert subscription.price != yearly_price
    assert subscription.price.plan == subscription.plan


def test_subscription_rejects_price_from_another_plan():
    user = get_user_model().objects.create_user(
        email="mismatched-price@example.com",
        password="strong-password-123",
    )
    pro_plan = SubscriptionPlan.objects.create(
        code="pro-mismatched-price",
        name="Pro",
        active_custom_metric_limit=10,
        wearable_connection_limit=2,
        sync_interval_minutes=15,
    )
    premium_plan = SubscriptionPlan.objects.create(
        code="premium-mismatched-price",
        name="Premium",
        active_custom_metric_limit=25,
        wearable_connection_limit=5,
        sync_interval_minutes=5,
    )
    premium_price = SubscriptionPrice.objects.create(
        plan=premium_plan,
        provider=SubscriptionPrice.Provider.STRIPE,
        provider_price_id="price_premium_mismatched",
        currency="usd",
        unit_amount=2000,
        billing_interval=SubscriptionPrice.BillingInterval.MONTH,
    )

    with pytest.raises(
        ValidationError,
        match="The selected price must belong to the subscription plan.",
    ):
        Subscription.objects.create(
            user=user,
            plan=pro_plan,
            price=premium_price,
            status=Subscription.Status.ACTIVE,
        )

def test_plan_cannot_have_duplicate_active_price_option():
    plan = SubscriptionPlan.objects.create(
          code="duplicate-price-plan",
          name="Pro",
          active_custom_metric_limit=10,
          wearable_connection_limit=2,
          sync_interval_minutes=15,
      )
    price_fields = {
          "plan": plan,
          "provider": SubscriptionPrice.Provider.STRIPE,
          "currency": "usd",
          "billing_interval": SubscriptionPrice.BillingInterval.MONTH,
          "is_active": True,
      }
    
    SubscriptionPrice.objects.create(
          provider_price_id="price_original",
          unit_amount=1000,
          **price_fields,
      )
    
    with pytest.raises(IntegrityError):
          with transaction.atomic():
              SubscriptionPrice.objects.create(
                  provider_price_id="price_duplicate",
                  unit_amount=1200,
                  **price_fields,
              )

def test_subscription_price_amount_must_be_above_zero():
      plan = SubscriptionPlan.objects.create(
          code="zero-price-plan",
          name="Pro",
          active_custom_metric_limit=10,
          wearable_connection_limit=2,
          sync_interval_minutes=15,
      )

      with pytest.raises(IntegrityError):
          with transaction.atomic():
              SubscriptionPrice.objects.create(
                  plan=plan,
                  provider=SubscriptionPrice.Provider.STRIPE,
                  provider_price_id="price_zero",
                  currency="usd",
                  unit_amount=0,
                  billing_interval=SubscriptionPrice.BillingInterval.MONTH,
              )

def test_checkout_attempt_tracks_user_price_and_pending_status():
      user = get_user_model().objects.create_user(
          email="checkout-attempt@example.com",
          password="strong-password-123",
      )
      plan = SubscriptionPlan.objects.create(
          code="pro-checkout-attempt",
          name="Pro",
          active_custom_metric_limit=10,
          wearable_connection_limit=2,
          sync_interval_minutes=15,
      )
      price = SubscriptionPrice.objects.create(
          plan=plan,
          provider=SubscriptionPrice.Provider.STRIPE,
          provider_price_id="price_checkout_attempt",
          currency="usd",
          unit_amount=1000,
          billing_interval=SubscriptionPrice.BillingInterval.MONTH,
          is_active=True,
      )

      attempt = CheckoutAttempt.objects.create(
          user=user,
           price=price,
      )

      assert attempt.user == user
      assert attempt.price == price
      assert attempt.status == CheckoutAttempt.Status.PENDING
      assert attempt.provider_checkout_session_id == ""

def test_billing_customer_belongs_to_user_and_provider():
    user = get_user_model().objects.create_user(
          email="billing-customer@example.com",
          password="strong-password-123",
      )
    
    billing_customer = BillingCustomer.objects.create(
          user=user,
          provider=BillingCustomer.Provider.STRIPE,
          provider_customer_id="cus_test_billing_customer",
      )
    
    assert billing_customer.user == user
    assert billing_customer.provider == BillingCustomer.Provider.STRIPE
    assert billing_customer.provider_customer_id == "cus_test_billing_customer"
    assert user.billing_customers.get() == billing_customer

def test_user_cannot_have_multiple_billing_customers_for_same_provider():
      user = get_user_model().objects.create_user(
          email="duplicate-billing-customer@example.com",
          password="strong-password-123",
      )

      BillingCustomer.objects.create(
          user=user,
          provider=BillingCustomer.Provider.STRIPE,
          provider_customer_id="cus_first",
      )

      with pytest.raises(IntegrityError):
          with transaction.atomic():
              BillingCustomer.objects.create(
                  user=user,
                  provider=BillingCustomer.Provider.STRIPE,
                  provider_customer_id="cus_second",
              )

      assert BillingCustomer.objects.filter(user=user).count() == 1

def test_provider_customer_id_cannot_belong_to_multiple_users():
      first_user = get_user_model().objects.create_user(
          email="first-billing-customer@example.com",
          password="strong-password-123",
      )
      second_user = get_user_model().objects.create_user(
          email="second-billing-customer@example.com",
          password="strong-password-123",
      )

      BillingCustomer.objects.create(
          user=first_user,
          provider=BillingCustomer.Provider.STRIPE,
          provider_customer_id="cus_shared",
      )

      with pytest.raises(IntegrityError):
          with transaction.atomic():
              BillingCustomer.objects.create(
                  user=second_user,
                  provider=BillingCustomer.Provider.STRIPE,
                  provider_customer_id="cus_shared",
              )

      assert BillingCustomer.objects.filter(
          provider_customer_id="cus_shared",
      ).count() == 1