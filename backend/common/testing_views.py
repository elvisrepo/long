from django.conf import settings
from django.core.management import call_command
from rest_framework import status
from rest_framework.decorators import api_view
from rest_framework.request import Request
from rest_framework.response import Response

from apps.metrics.defaults import seed_default_metric_definitions
from apps.subscriptions.defaults import seed_default_subscription_plan
from apps.subscriptions.models import SubscriptionPlan, SubscriptionPrice


@api_view(["POST"])
def reset_e2e_database_view(request: Request) -> Response:
    if not getattr(settings, "ENABLE_E2E_TESTING_API", False):
        return Response(status=status.HTTP_404_NOT_FOUND)

    # Flush only the active runtime database; in E2E that is longevity_e2e.
    # Flush removes migration seed rows too, so restore the baseline app data
    # that Playwright expects after each reset.
    call_command("flush", "--no-input", verbosity=0)
    seed_default_metric_definitions()
    seed_default_subscription_plan()
    seed_e2e_subscription_plans()
    return Response(status=status.HTTP_204_NO_CONTENT)


def seed_e2e_subscription_plans() -> None:
    pro_plan, _created = SubscriptionPlan.objects.update_or_create(
        code="pro",
        defaults={
            "name": "Pro",
            "active_custom_metric_limit": 10,
            "wearable_connection_limit": 2,
            "sync_interval_minutes": 15,
            "analytics_enabled": True,
            "csv_import_enabled": True,
            "is_default": False,
            "is_active": True,
        },
    )

    SubscriptionPrice.objects.update_or_create(
        provider=SubscriptionPrice.Provider.STRIPE,
        provider_price_id="price_e2e_pro_monthly",
        defaults={
            "plan": pro_plan,
            "currency": "usd",
            "unit_amount": 1000,
            "billing_interval": SubscriptionPrice.BillingInterval.MONTH,
            "is_active": True,
        },
    )
    SubscriptionPrice.objects.update_or_create(
        provider=SubscriptionPrice.Provider.STRIPE,
        provider_price_id="price_e2e_pro_yearly",
        defaults={
            "plan": pro_plan,
            "currency": "usd",
            "unit_amount": 10000,
            "billing_interval": SubscriptionPrice.BillingInterval.YEAR,
            "is_active": True,
        },
    )
