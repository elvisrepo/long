import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from apps.subscriptions.models import Subscription, SubscriptionPlan

pytestmark = pytest.mark.django_db


def authenticate_client_for(email: str) -> tuple[APIClient, object]:
    user = get_user_model().objects.create_user(
        email=email,
        password="strong-password-123",
    )
    client = APIClient()
    client.credentials(
        HTTP_AUTHORIZATION=f"Bearer {RefreshToken.for_user(user).access_token}",
    )
    return client, user


def test_subscription_portal_requires_authentication():
    response = APIClient().post(
        "/api/v1/subscriptions/portal/",
        {},
        format="json",
    )

    assert response.status_code == 401


def test_subscription_portal_requires_billing_customer():
    client, user = authenticate_client_for("alice@example.com")
    free_plan = SubscriptionPlan.objects.get(code="free")
    Subscription.objects.create(
        user=user,
        plan=free_plan,
        status=Subscription.Status.ACTIVE,
    )

    response = client.post(
        "/api/v1/subscriptions/portal/",
        {},
        format="json",
    )

    assert response.status_code == 400
    assert response.json() == {
        "detail": "No Stripe billing customer is available.",
    }
