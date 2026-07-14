from typing import cast

from rest_framework import serializers

from apps.subscriptions.models import (
    BillingCustomer,
    Subscription,
    SubscriptionPlan,
    SubscriptionPrice,
)

from apps.subscriptions.services import CURRENT_SUBSCRIPTION_STATUSES


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


class CurrentSubscriptionPriceSerializer(serializers.ModelSerializer):
    class Meta:
        model = SubscriptionPrice
        fields = [
            "currency",
            "unit_amount",
            "billing_interval",
        ]
        read_only_fields = fields


class CurrentSubscriptionSerializer(serializers.ModelSerializer):
    plan = SubscriptionPlanSerializer(read_only=True)
    price = CurrentSubscriptionPriceSerializer(read_only=True)
    billing_portal_available = serializers.SerializerMethodField()

    class Meta:
        model = Subscription
        fields = [
            "id",
            "status",
            "billing_portal_available",
            "current_period_start",
            "current_period_end",
            "cancel_at",
            "cancel_at_period_end",
            "price",
            "plan",
        ]
        read_only_fields = fields

    def get_billing_portal_available(
        self,
        subscription: Subscription,
    ) -> bool:
        return BillingCustomer.objects.filter(
            user=subscription.user,
            provider=BillingCustomer.Provider.STRIPE,
        ).exists()


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


class SubscriptionCheckoutSerializer(serializers.Serializer):
    price_id = serializers.PrimaryKeyRelatedField(
        source="price",
        queryset=SubscriptionPrice.objects.filter(
            provider=SubscriptionPrice.Provider.STRIPE,
            is_active=True,
            plan__is_active=True,
            plan__is_default=False,
        ),
    )

    def validate(self, attrs: dict[str, object]) -> dict[str, object]:
        request = self.context["request"]
        price = cast(SubscriptionPrice, attrs["price"])

        current_subscription = Subscription.objects.filter(
            user=request.user,
            status__in=CURRENT_SUBSCRIPTION_STATUSES,
        ).first()

        if current_subscription is None:
            raise serializers.ValidationError(
                {
                    "detail": (
                        "A current subscription is required before checkout."
                    ),
                }
            )

        if current_subscription.price_id == price.id:
            raise serializers.ValidationError(
                {
                    "price_id": ["You are already subscribed to this price."],
                }
            )
        # this user alrady has a real stripe- managed sub
        if (
            current_subscription.provider == SubscriptionPrice.Provider.STRIPE
            and current_subscription.provider_subscription_id
        ):
            raise serializers.ValidationError(
                {
                    "detail": [
                        (
                            "Manage changes to an active Stripe subscription "
                            "through the billing portal."
                        )
                    ],
                }
            )

        return attrs
