import pytest
from rest_framework.test import APIClient

pytestmark = pytest.mark.django_db\

def test_subscription_checkout_requires_authentication():
      response = APIClient().post(
          "/api/v1/subscriptions/checkout/",
          {"price_id": "00000000-0000-0000-0000-000000000000"},
          format="json",
      )

      assert response.status_code == 401