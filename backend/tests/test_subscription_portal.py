import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from apps.subscriptions.models import (
      BillingCustomer,
      Subscription,
      SubscriptionPlan,
  )

from unittest.mock import patch

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


def test_subscription_portal_returns_hosted_portal_url():
    client, user = authenticate_client_for("portal@example.com")
    billing_customer = BillingCustomer.objects.create(
          user=user,
          provider=BillingCustomer.Provider.STRIPE,
          provider_customer_id="cus_portal_test",
      )
    
    with patch(
          "apps.subscriptions.views.create_customer_portal_session",
          return_value="https://billing.stripe.com/p/session/test_portal",
      ) as create_customer_portal_session:
          response = client.post(
              "/api/v1/subscriptions/portal/",
              {},
              format="json",
          )

    
    assert response.status_code == 201
    assert response.json() == {
          "url": "https://billing.stripe.com/p/session/test_portal",
      }
    create_customer_portal_session.assert_called_once_with(
          billing_customer=billing_customer,
      )