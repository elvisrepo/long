from django.contrib.auth.models import AbstractBaseUser
from rest_framework import serializers

from apps.metrics.models import MetricDefinition


ACTIVE_CUSTOM_METRIC_LIMIT = 3
ACTIVE_CUSTOM_METRIC_LIMIT_MESSAGE = "Active custom metric limit reached."


def validate_active_custom_metric_limit(
    user: AbstractBaseUser,
    *,
    excluding_definition: MetricDefinition | None = None,
) -> None:
    #We just count the user’s active custom metrics. If they already have 3, block creating the 4th.
    active_custom_metrics = MetricDefinition.objects.filter(  # counts only custom metrics of this user
        user=user,
        is_default=False,
        is_active=True,
    )

    if excluding_definition is not None:
        active_custom_metrics = active_custom_metrics.exclude(
            id=excluding_definition.id,
        )

    if active_custom_metrics.count() >= ACTIVE_CUSTOM_METRIC_LIMIT:
        raise serializers.ValidationError(
            {"non_field_errors": [ACTIVE_CUSTOM_METRIC_LIMIT_MESSAGE]}
        )



'''
 The * means every argument after it must be passed by keyword.

  Allowed:

  validate_active_custom_metric_limit(user, excluding_definition=definition)

  Not allowed:

  validate_active_custom_metric_limit(user, definition)

  Why use it here? Clarity. excluding_definition is optional and important. Requiring the keyword makes the call
  self-documenting and prevents accidentally passing the wrong positional value
'''