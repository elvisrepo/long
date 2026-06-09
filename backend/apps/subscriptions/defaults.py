from apps.subscriptions.models import SubscriptionPlan


FREE_SUBSCRIPTION_PLAN = {
    "name": "Free",
    "active_custom_metric_limit": 3,
    "wearable_connection_limit": 0,
    "sync_interval_minutes": 60,
    "analytics_enabled": False,
    "csv_import_enabled": False,
    "is_default": True,
    "is_active": True,
}


def seed_default_subscription_plan() -> None:
    """Ensure the canonical free plan exists in the active runtime database."""
    SubscriptionPlan.objects.update_or_create(
        code="free",
        defaults=FREE_SUBSCRIPTION_PLAN,
    )
