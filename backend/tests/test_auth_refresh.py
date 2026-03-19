import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient


pytestmark = pytest.mark.django_db

def test_refresh_returns_new_access_token_for_valid_refresh_token():
    client = APIClient()
    user = get_user_model().objects.create_user(
          email="alice@example.com",
          password="strong-password-123",
      )
    
    login_response = client.post(
          "/api/auth/login/",
          {
              "email": "alice@example.com",
              "password": "strong-password-123",
          },
          format="json",
      )
    
    refresh_token = login_response.json()["refresh"]


    response = client.post(
          "/api/auth/refresh/",
          {
              "refresh": refresh_token,
          },
          format="json",
      )

    assert response.status_code == 200
    assert set(response.json().keys()) == {"access"}


def test_refresh_rejects_invalid_refresh_token():
      client = APIClient()

      response = client.post(
          "/api/auth/refresh/",
          {
              "refresh": "not-a-real-refresh-token",
          },
      )

      assert response.status_code == 401