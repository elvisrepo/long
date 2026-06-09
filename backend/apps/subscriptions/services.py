from django.contrib.auth.models import AbstractBaseUser

from apps.subscriptions.models import Subscription, SubscriptionPlan

CURRENT_SUBSCRIPTION_STATUSES = (
      Subscription.Status.TRIALING,
      Subscription.Status.ACTIVE,
      Subscription.Status.PAST_DUE,
      Subscription.Status.INCOMPLETE,
  )

def get_current_subscription_plan(
      user: AbstractBaseUser,
  ) -> SubscriptionPlan:
      subscription = (
          Subscription.objects.select_related("plan")
          .filter(
              user=user,
              status__in=CURRENT_SUBSCRIPTION_STATUSES,
          )
          .get()
      )

      return subscription.plan