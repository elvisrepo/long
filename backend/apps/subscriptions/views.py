from rest_framework import generics
from rest_framework.permissions import IsAuthenticated

from apps.subscriptions.models import Subscription
from apps.subscriptions.serializers import CurrentSubscriptionSerializer
from apps.subscriptions.services import CURRENT_SUBSCRIPTION_STATUSES


class CurrentSubscriptionView(generics.RetrieveAPIView):
    serializer_class = CurrentSubscriptionSerializer
    permission_classes = [IsAuthenticated]

    def get_object(self) -> Subscription:
        return Subscription.objects.select_related("plan").get(
            user=self.request.user,
            status__in=CURRENT_SUBSCRIPTION_STATUSES, #only their effective subscription, not cancelled history.
        )
