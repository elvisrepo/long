import uuid

from django.db import models

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