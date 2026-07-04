from rest_framework.test import APIClient


def test_subscription_portal_requires_authentication():
    response = APIClient().post(
          "/api/v1/subscriptions/portal/",
          {},
          format="json",
      )

    assert response.status_code == 401