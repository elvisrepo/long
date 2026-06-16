from django.db.models import Prefetch
from rest_framework import generics, status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.subscriptions.models import (
    Subscription,
    SubscriptionPlan,
    SubscriptionPrice,
)
from apps.subscriptions.serializers import (
    CurrentSubscriptionSerializer,
    SubscriptionCheckoutSerializer,
    SubscriptionPlanCatalogSerializer,
)
from apps.subscriptions.services import (
    CURRENT_SUBSCRIPTION_STATUSES,
    create_checkout_session,
)


class CurrentSubscriptionView(generics.RetrieveAPIView):
    serializer_class = CurrentSubscriptionSerializer
    permission_classes = [IsAuthenticated]

    def get_object(self) -> Subscription:
        return Subscription.objects.select_related("plan").get(
            user=self.request.user,
            # Only return the effective subscription, not cancelled history.
            status__in=CURRENT_SUBSCRIPTION_STATUSES,
        )


class SubscriptionPlanListView(generics.ListAPIView):
    serializer_class = SubscriptionPlanCatalogSerializer
    permission_classes = [AllowAny]

    def get_queryset(self):
        # Retired prices remain in the database for billing history but are not
        # offered for new checkout selections.
        active_prices = SubscriptionPrice.objects.filter(
            is_active=True,
        ).order_by("unit_amount", "id")

        return (
            SubscriptionPlan.objects.filter(is_active=True)
            .prefetch_related(
                # Fetch all active prices for the returned plans in one extra
                # query, then attach each plan's list as plan.active_prices.
                Prefetch(
                    "prices",
                    queryset=active_prices,
                    to_attr="active_prices",
                )
            )
            .order_by("-is_default", "code")
        )

class SubscriptionCheckoutView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request) -> Response:
        serializer = SubscriptionCheckoutSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        checkout_url = create_checkout_session(
            user=request.user,
            price=serializer.validated_data["price"],
        )

        return Response(
            {"url": checkout_url},
            status=status.HTTP_201_CREATED,
        )
