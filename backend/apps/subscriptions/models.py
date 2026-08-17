import uuid
from typing import Any

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models
from django.db.models import Q


class SubscriptionPlan(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    code = models.SlugField(max_length=50, unique=True)
    name = models.CharField(max_length=100)
    active_custom_metric_limit = models.PositiveIntegerField()
    wearable_connection_limit = models.PositiveIntegerField()
    # Whether an official client may schedule unattended wearable sync work.
    # Manual sync remains available when the plan has a wearable slot.
    automatic_sync_enabled = models.BooleanField(default=False)
    # Minimum cadence used by automatic scheduling or manual-sync cooldown.
    sync_interval_minutes = models.PositiveIntegerField()
    analytics_enabled = models.BooleanField(default=False)
    csv_import_enabled = models.BooleanField(default=False)
    is_default = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "subscriptions_subscription_plan"
        constraints = [
            models.CheckConstraint(
                condition=(
                    Q(automatic_sync_enabled=False)
                    | Q(sync_interval_minutes__gte=15)
                ),
                name="subscription_plan_auto_sync_min_15",
            ),
        ]

    def __str__(self) -> str:
        return self.name


class SubscriptionPrice(models.Model):
    class Provider(models.TextChoices):
        STRIPE = "stripe", "Stripe"

    class BillingInterval(models.TextChoices):
        MONTH = "month", "Monthly"
        YEAR = "year", "Yearly"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    plan = models.ForeignKey(
        SubscriptionPlan,
        on_delete=models.PROTECT,
        related_name="prices",
    )

    provider = models.CharField(
        max_length=32,
        choices=Provider.choices,
    )
    provider_price_id = models.CharField(max_length=255, unique=True)
    currency = models.CharField(max_length=3)
    unit_amount = models.PositiveIntegerField()
    billing_interval = models.CharField(
        max_length=16,
        choices=BillingInterval.choices,
    )
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "subscriptions_subscription_price"
        constraints = [
            models.UniqueConstraint(
                fields=[
                    "plan",
                    "provider",
                    "currency",
                    "billing_interval",
                ],
                condition=Q(is_active=True),
                name="unique_active_price_per_plan_option",
            ),
            models.CheckConstraint(
                condition=Q(unit_amount__gt=0),
                name="subscription_price_amount_above_zero",
            ),
        ]

    def __str__(self) -> str:
        return (
            f"{self.plan.code}: {self.unit_amount} "
            f"{self.currency}/{self.billing_interval}"
        )



class BillingCustomer(models.Model):
    class Provider(models.TextChoices):
          STRIPE = "stripe", "Stripe"
    
    id = models.UUIDField(primary_key=True, default=uuid.uuid4,
      editable=False)
    
    user = models.ForeignKey(
          settings.AUTH_USER_MODEL,
          on_delete=models.CASCADE,
          related_name="billing_customers",
      )
    
    provider = models.CharField(max_length=32, choices=Provider.choices)
    provider_customer_id = models.CharField(max_length=255)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
          db_table = "subscriptions_billing_customer"
          constraints = [
              models.UniqueConstraint(
                  fields=["user", "provider"],
                  name="unique_billing_customer_per_user_provider",
              ),
              models.UniqueConstraint(
                  fields=["provider", "provider_customer_id"],
                  name="unique_provider_billing_customer",
              ),
          ]

    def __str__(self) -> str:
          return f"{self.user_id}: {self.provider}"


class Subscription(models.Model):
    class Status(models.TextChoices):
        TRIALING = "trialing", "Trialing"
        ACTIVE = "active", "Active"
        PAST_DUE = "past_due", "Past Due"
        CANCELLED = "cancelled", "Cancelled"
        INCOMPLETE = "incomplete", "Incomplete"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="subscriptions",
    )

    plan = models.ForeignKey(
        SubscriptionPlan,
        on_delete=models.PROTECT,
        related_name="subscriptions",
    )

    price = models.ForeignKey(
        SubscriptionPrice,
        on_delete=models.PROTECT,
        related_name="subscriptions",
        null=True,
        blank=True,
    )

    status = models.CharField(max_length=20, choices=Status.choices)
    provider = models.CharField(max_length=32, null=True, blank=True)
    provider_customer_id = models.CharField(
        max_length=255,
        null=True,
        blank=True,
    )
    provider_subscription_id = models.CharField(
        max_length=255,
        unique=True,
        null=True,
        blank=True,
    )

    # Cached Stripe billing-period boundaries for the current paid cycle.
    # Free subscriptions and newly-created paid subscriptions may have these as
    # null until Stripe sends customer.subscription.updated.
    current_period_start = models.DateTimeField(null=True, blank=True)
    current_period_end = models.DateTimeField(null=True, blank=True)

    # Exact future cancellation timestamp from Stripe, if one is scheduled.
    # This can equal current_period_end for period-end cancellation, but it can
    # also be a custom timestamp.
    cancel_at = models.DateTimeField(null=True, blank=True)

    # Normalized local flag for "this subscription is scheduled to cancel at
    # the current period end." Stripe may represent this as
    # cancel_at_period_end=true or as cancel_at == current_period_end.
    cancel_at_period_end = models.BooleanField(default=False)

    # When this local subscription row became historical/cancelled in our
    # system. This is not necessarily the same as Stripe's canceled_at.
    cancelled_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "subscriptions_subscription"
        constraints = [
            models.UniqueConstraint(
                fields=["user"],
                condition=Q(
                    status__in=[
                        "trialing",
                        "active",
                        "past_due",
                        "incomplete",
                    ]
                ),
                name="unique_current_subscription_per_user",
            ),
        ]

    def clean(self) -> None:
        super().clean()

        if self.price_id is not None and self.price.plan_id != self.plan_id:
            raise ValidationError(
                {
                    "price": (
                        "The selected price must belong to the subscription plan."
                    )
                }
            )

    def save(self, *args: Any, **kwargs: Any) -> None:
        # Model validation is not automatic on save, so enforce the
        # cross-table plan/price invariant on normal ORM writes.
        self.clean()
        super().save(*args, **kwargs)

    def __str__(self) -> str:
        return f"{self.user_id}: {self.plan.code}"


class CheckoutAttempt(models.Model):
    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        COMPLETED = "completed", "Completed"
        CONFIRMED = "confirmed", "Confirmed"
        FAILED = "failed", "Failed"
        EXPIRED = "expired", "Expired"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="checkout_attempts",
    )

    price = models.ForeignKey(
        SubscriptionPrice,
        on_delete=models.PROTECT,
        related_name="checkout_attempts",
    )

    expected_subscription = models.ForeignKey(
        Subscription,
        on_delete=models.PROTECT,
        related_name="checkout_attempts",
        null=True,
        blank=True,
    )

    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.PENDING,
    )

    provider_checkout_session_id = models.CharField(
        max_length=255,
        blank=True,
        default="",
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "subscriptions_checkout_attempt"

    def __str__(self) -> str:
        return f"{self.user_id}: {self.price_id}: {self.status}"


class StripeWebhookEvent(models.Model):
    provider_event_id = models.CharField(max_length=255, unique=True)
    event_type = models.CharField(max_length=255)
    processed_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "subscriptions_stripe_webhook_event"

    def __str__(self) -> str:
        return f"{self.provider_event_id}: {self.event_type}"
