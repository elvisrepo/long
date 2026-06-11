from rest_framework import serializers

from apps.subscriptions.models import Subscription, SubscriptionPlan


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


class SubscriptionPlanCatalogSerializer(SubscriptionPlanSerializer):
      class Meta(SubscriptionPlanSerializer.Meta):
          fields = [
              *SubscriptionPlanSerializer.Meta.fields,
              "is_default",
          ]