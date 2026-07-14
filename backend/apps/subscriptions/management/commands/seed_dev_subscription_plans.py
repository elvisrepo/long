from __future__ import annotations

from django.core.management.base import BaseCommand

from apps.subscriptions.models import SubscriptionPlan, SubscriptionPrice


class Command(BaseCommand):
    help = "Seed local development subscription plans and active Stripe test prices."

    def handle(self, *args: object, **options: object) -> None:
        pro_plan, _ = SubscriptionPlan.objects.update_or_create(
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

        self.seed_price(
            plan=pro_plan,
            provider_price_id="price_replace_with_stripe_test_monthly",
            currency="usd",
            unit_amount=1000,
            billing_interval=str(SubscriptionPrice.BillingInterval.MONTH),
        )
        self.seed_price(
            plan=pro_plan,
            provider_price_id="price_replace_with_stripe_test_yearly",
            currency="usd",
            unit_amount=10000,
            billing_interval=str(SubscriptionPrice.BillingInterval.YEAR),
        )

        self.stdout.write(
            self.style.SUCCESS("Seeded development subscription plans.")
        )

    def seed_price(
        self,
        *,
        plan: SubscriptionPlan,
        provider_price_id: str,
        currency: str,
        unit_amount: int,
        billing_interval: str,
    ) -> None:
        SubscriptionPrice.objects.update_or_create(
            provider=SubscriptionPrice.Provider.STRIPE,
            provider_price_id=provider_price_id,
            defaults={
                "plan": plan,
                "currency": currency,
                "unit_amount": unit_amount,
                "billing_interval": billing_interval,
                "is_active": True,
            },
        )
