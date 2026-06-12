from rest_framework import serializers

from apps.subscriptions.models import (
    Subscription,
    SubscriptionPlan,
    SubscriptionPrice,
)


class SubscriptionPlanSerializer(serializers.ModelSerializer):
    class Meta:
        model = SubscriptionPlan
        fields = [
            "code",
            "name",
            "active_custom_metric_limit",
            "wearable_connection_limit",
            "sync_interval_minutes",
            "analytics_enabled",
            "csv_import_enabled",
        ]


class CurrentSubscriptionSerializer(serializers.ModelSerializer):
    plan = SubscriptionPlanSerializer(read_only=True)

    class Meta:
        model = Subscription
        fields = ["id", "status", "plan"]
        read_only_fields = fields


class SubscriptionPriceCatalogSerializer(serializers.ModelSerializer):
    class Meta:
        model = SubscriptionPrice
        # Stripe's provider_price_id stays server-side; clients select our
        # internal price UUID and never submit provider billing identifiers.
        fields = [
            "id",
            "currency",
            "unit_amount",
            "billing_interval",
        ]
        read_only_fields = fields


class SubscriptionPlanCatalogSerializer(SubscriptionPlanSerializer):
    # The view stores its filtered prefetch on active_prices. Using source here
    # exposes that list under the stable public response key "prices".
    prices = SubscriptionPriceCatalogSerializer(
        source="active_prices",   # reads the filtered list attached by the view.
        many=True,
        read_only=True,
    )

    class Meta(SubscriptionPlanSerializer.Meta):
        fields = [
            *SubscriptionPlanSerializer.Meta.fields,
            "is_default",
            "prices",
        ]
