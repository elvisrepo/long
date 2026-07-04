import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken
from django.conf import settings

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
    

def test_create_customer_portal_session_uses_customer_and_return_url():
    from apps.subscriptions.services import create_customer_portal_session

    '''
         Flow:

        real create_customer_portal_session()
            ↓
        mocked StripeClient(...)
            ↓
        mocked billing_portal.sessions.create(...)
            ↓
        fake session object
            ↓
        fake session.url
            ↓
        portal_url

        The distinction is:

        - View test mocks create_customer_portal_session.
        - Service test calls the real service but mocks Stripe’s SDK boundary.

        This tests our Stripe request construction without contacting Stripe.


        ---
            - StripeClient receives our configured secret key.
            - sessions.create() receives the correct customer and return URL.
            - The service returns Stripe’s session.url.

            It verifies our integration contract, not Stripe’s internal behavior or network
            availability. A separate opt-in sandbox test would verify the real Stripe API
            call.
    '''

    user = get_user_model().objects.create_user(
          email="portal-service@example.com",
          password="strong-password-123",
      )
    
    billing_customer = BillingCustomer.objects.create(
          user=user,
          provider=BillingCustomer.Provider.STRIPE,
          provider_customer_id="cus_portal_service",
      )

    with patch("apps.subscriptions.services.StripeClient") as stripe_client:
          portal_session = (
              stripe_client.return_value.v1.billing_portal.sessions.create
          )
          portal_session.return_value.url = (
              "https://billing.stripe.com/p/session/test_portal"
          )

          portal_url = create_customer_portal_session(
              billing_customer=billing_customer,
          )

    assert portal_url == "https://billing.stripe.com/p/session/test_portal"
    stripe_client.assert_called_once_with(settings.STRIPE_SECRET_KEY)
    portal_session.assert_called_once_with(
          {
              "customer": "cus_portal_service",
              "return_url": settings.STRIPE_CUSTOMER_PORTAL_RETURN_URL,
          }
      )

