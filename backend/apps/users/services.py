from django.db import transaction

from apps.subscriptions.models import Subscription, SubscriptionPlan
from apps.users.models import User

@transaction.atomic
def create_user_with_subscription(*, email: str, password: str) -> User:
    free_plan = SubscriptionPlan.objects.get(
          code="free",
          is_active=True,
          is_default=True,
      )
    
    user = User.objects.create_user(
          email=email,
          password=password,
      )

    Subscription.objects.create(
          user=user,
          plan=free_plan,
          status=Subscription.Status.ACTIVE,
      )

    return user