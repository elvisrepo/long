from uuid import UUID

from django.contrib.auth import get_user_model
from django.contrib.auth.models import AbstractBaseUser
from django.core.exceptions import ValidationError
from django.db import transaction
from django.utils import timezone

from apps.subscriptions.models import (
    Subscription,
    SubscriptionPlan,
    SubscriptionPrice,
)


CURRENT_SUBSCRIPTION_STATUSES = (
    Subscription.Status.TRIALING,
    Subscription.Status.ACTIVE,
    Subscription.Status.PAST_DUE,
    Subscription.Status.INCOMPLETE,
)


class StaleSubscriptionTransitionError(Exception):
    """Raised when the subscription observed by the caller is no longer current."""


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


# Entering this atomic function begins the transaction. A successful return
# commits it and releases the row lock; any exception rolls everything back.
@transaction.atomic
def change_subscription_plan(
    *,
    user: AbstractBaseUser,
    plan: SubscriptionPlan,
    price: SubscriptionPrice | None,
    expected_subscription_id: UUID,
) -> Subscription:
    # 1. Lock the user row so plan transitions for this account run one at a time.
    get_user_model().objects.select_for_update().get(pk=user.pk)

    # 2. Find the subscription currently responsible for the user's entitlements.
    current_subscription = Subscription.objects.get(
        user=user,
        status__in=CURRENT_SUBSCRIPTION_STATUSES,
    )

    # Reject a request that was based on subscription state replaced by an
    # earlier transition while this request was waiting for the user-row lock.
    if current_subscription.id != expected_subscription_id:
        raise StaleSubscriptionTransitionError

    if price is not None and price.is_active is False:
        raise ValidationError(
            {"price": "The selected price is not active."}
        )

    # 3. Turn the current row into history and record when it stopped being current.
    current_subscription.status = Subscription.Status.CANCELLED
    current_subscription.cancelled_at = timezone.now()
    current_subscription.save(
        update_fields=["status", "cancelled_at", "updated_at"],
    )

    # 4. Create the replacement current subscription using the requested plan.
    return Subscription.objects.create(
        user=user,
        plan=plan,
        price=price,
        status=Subscription.Status.ACTIVE,
    )
