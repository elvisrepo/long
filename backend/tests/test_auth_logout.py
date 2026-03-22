import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient


pytestmark = pytest.mark.django_db

def test_logout_blacklists_refresh_token():
    client = APIClient()

    get_user_model().objects.create_user(
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

    logout_response = client.post(
          "/api/auth/logout/",
          {
              "refresh": refresh_token,
          },
          format="json",
      )
    
    assert logout_response.status_code == 204

    refresh_response = client.post(
          "/api/auth/refresh/",
          {
              "refresh": refresh_token,
          },
          format="json",
      )

    assert refresh_response.status_code == 401

def test_logout_requires_refresh_token():
      client = APIClient()

      response = client.post(
          "/api/auth/logout/",
          {},
          format="json",
      )

      assert response.status_code == 400

def test_logout_rejects_invalid_refresh_token():
      client = APIClient()

      response = client.post(
          "/api/auth/logout/",
          {
              "refresh": "not-a-real-refresh-token",
          },
          format="json",
      )

      assert response.status_code == 400

def test_logout_accepts_refresh_token_from_cookie():
      client = APIClient()
      get_user_model().objects.create_user(
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

      refresh_token = login_response.cookies["refresh_token"].value

      response = client.post(
          "/api/auth/logout/",
          {},
          format="json",
          HTTP_COOKIE=f"refresh_token={refresh_token}",
      )

      assert response.status_code == 204


def test_logout_clears_refresh_token_cookie():
      client = APIClient()
      get_user_model().objects.create_user(
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

      refresh_token = login_response.cookies["refresh_token"].value

      response = client.post(
          "/api/auth/logout/",
          {},
          format="json",
          HTTP_COOKIE=f"refresh_token={refresh_token}",
      )

      assert response.status_code == 204
      assert "refresh_token" in response.cookies
      assert response.cookies["refresh_token"].value == ""