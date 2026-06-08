import uuid

from django.db import models
from django.conf import settings

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

    def __str__(self) -> str:
          return f"{self.user_id}: {self.plan.code}"