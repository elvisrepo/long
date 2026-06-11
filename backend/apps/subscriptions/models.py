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
    sync_interval_minutes = models.PositiveIntegerField()
    analytics_enabled = models.BooleanField(default=False)
    csv_import_enabled = models.BooleanField(default=False)
    is_default = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "subscriptions_subscription_plan"

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

    current_period_start = models.DateTimeField(null=True, blank=True)
    current_period_end = models.DateTimeField(null=True, blank=True)
    cancel_at_period_end = models.BooleanField(default=False)
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
