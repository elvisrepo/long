from typing import TypedDict

from django.contrib.auth.models import AbstractBaseUser
from rest_framework import serializers

from apps.metrics.models import MetricDefinition
from apps.subscriptions.services import get_current_subscription_plan


ACTIVE_CUSTOM_METRIC_LIMIT_MESSAGE = "Active custom metric limit reached."


class ActiveCustomMetricUsage(TypedDict):
    used: int
    limit: int


def get_active_custom_metric_usage(
    user: AbstractBaseUser,
) -> ActiveCustomMetricUsage:
    plan = get_current_subscription_plan(user)
    used = MetricDefinition.objects.filter(
        user=user,
        is_default=False,
        is_active=True,
    ).count()

    return {
        "used": used,
        "limit": plan.active_custom_metric_limit,
    }


def validate_active_custom_metric_limit(
    user: AbstractBaseUser,
    *,
    excluding_definition: MetricDefinition | None = None,
) -> None:
    if excluding_definition is None:
        usage = get_active_custom_metric_usage(user)
        used = usage["used"]
        limit = usage["limit"]
    else:
        plan = get_current_subscription_plan(user)
        used = (
            MetricDefinition.objects.filter(
                user=user,
                is_default=False,
                is_active=True,
            )
            .exclude(id=excluding_definition.id)
            .count()
        )
        limit = plan.active_custom_metric_limit

    if used >= limit:
        raise serializers.ValidationError(
            {"non_field_errors": [ACTIVE_CUSTOM_METRIC_LIMIT_MESSAGE]}
        )
