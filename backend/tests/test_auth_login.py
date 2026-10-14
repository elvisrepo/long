import pytest
from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.test import override_settings
from rest_framework.test import APIClient


pytestmark = pytest.mark.django_db


@pytest.fixture(autouse=True)
def clear_auth_throttle_cache():
    cache.clear()


def test_mobile_login_returns_jwt_tokens_for_valid_credentials():
    client = APIClient()
    User = get_user_model()

    User.objects.create_user(
          email="alice@example.com",
          password="strong-password-123",
      )
    
    response = client.post(
        "/api/auth/mobile/login/",
        {
            "email": "ALICE@example.com",
            "password": "strong-password-123",
        }
    )

    assert response.status_code == 200
    assert set(response.json().keys()) == {"access", "refresh"}
    assert "refresh_token" not in response.cookies



def test_mobile_login_rejects_invalid_credentials():
      client = APIClient()
      User = get_user_model()

      User.objects.create_user(
          email="alice@example.com",
          password="strong-password-123",
      )

      response = client.post(
          "/api/auth/mobile/login/",
          {
              "email": "alice@example.com",
              "password": "wrong-password",
          },
          format="json",
      )

      assert response.status_code == 400
      assert response.json() == {
          "detail": "Invalid credentials.",
      }

def test_login_requires_email_and_password():
     client = APIClient()

     response = client.post(
          "/api/auth/mobile/login/",
          {},
          format="json",
     )

     assert response.status_code == 400
     assert response.json() == {
          "email": ["This field is required."],
          "password": ["This field is required."],
      }


def test_login_is_limited_per_email_across_web_and_mobile_endpoints():
    client = APIClient()
    payload = {"email": "target@example.com", "password": "wrong-password"}

    responses = [
        client.post("/api/auth/mobile/login/", payload, format="json")
        for _ in range(5)
    ]
    blocked_response = client.post(
        "/api/auth/web/login/", payload, format="json"
    )

    assert all(response.status_code == 400 for response in responses)
    assert blocked_response.status_code == 429


@override_settings(REFRESH_TOKEN_COOKIE_SECURE=False)
def test_web_login_returns_access_only_and_sets_refresh_cookie():
      client = APIClient()
      User = get_user_model()

      User.objects.create_user(
        email="alice@example.com",
        password="strong-password-123",
    )

      response = client.post(
          "/api/auth/web/login/",
          {
              "email": "alice@example.com",
              "password": "strong-password-123",
          },
          format="json",
      )

      assert response.status_code == 200
      assert set(response.json().keys()) == {"access"}
      assert "refresh_token" in response.cookies
      assert not response.cookies["refresh_token"]["secure"]
