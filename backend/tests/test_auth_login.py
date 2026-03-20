import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient


pytestmark = pytest.mark.django_db


def test_login_returns_jwt_tokens_for_valid_credentials():
    client = APIClient()
    User = get_user_model()

    User.objects.create_user(
          email="alice@example.com",
          password="strong-password-123",
      )
    
    response = client.post(
        "/api/auth/login/",
        {
            "email": "ALICE@example.com",
            "password": "strong-password-123",
        }
    )

    assert response.status_code == 200
    assert set(response.json().keys()) == {"access", "refresh"}



def test_login_rejects_invalid_credentials():
      client = APIClient()
      User = get_user_model()

      User.objects.create_user(
          email="alice@example.com",
          password="strong-password-123",
      )

      response = client.post(
          "/api/auth/login/",
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
          "/api/auth/login/",
          {},
          format="json",
     )

     assert response.status_code == 400
     assert response.json() == {
          "email": ["This field is required."],
          "password": ["This field is required."],
      }


def test_login_sets_refresh_token_cookie():
      client = APIClient()
      User = get_user_model()

      User.objects.create_user(
        email="alice@example.com",
        password="strong-password-123",
    )

      response = client.post(
          "/api/auth/login/",
          {
              "email": "alice@example.com",
              "password": "strong-password-123",
          },
          format="json",
      )

      assert response.status_code == 200
      assert "refresh_token" in response.cookies