from django.contrib.auth.models import AbstractBaseUser
from rest_framework import serializers

from apps.metrics.models import MetricDefinition


ACTIVE_CUSTOM_METRIC_LIMIT = 3
ACTIVE_CUSTOM_METRIC_LIMIT_MESSAGE = "Active custom metric limit reached."

from typing import TypedDict

class ActiveCustomMetricUsage(TypedDict):
      used: int
      limit: int

def get_active_custom_metric_usage(
      user: AbstractBaseUser,
  ) -> ActiveCustomMetricUsage:
      used = MetricDefinition.objects.filter(
          user=user,
          is_default=False,
          is_active=True,
      ).count()

      return {
          "used": used,
          "limit": ACTIVE_CUSTOM_METRIC_LIMIT,
      }

def validate_active_custom_metric_limit(
      user: AbstractBaseUser,
      *,
      excluding_definition: MetricDefinition | None = None,
  ) -> None:
      if excluding_definition is None:
          used = get_active_custom_metric_usage(user)["used"]
      else:
          used = MetricDefinition.objects.filter(
              user=user,
              is_default=False,
              is_active=True,
          ).exclude(id=excluding_definition.id).count()

      if used >= ACTIVE_CUSTOM_METRIC_LIMIT:
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