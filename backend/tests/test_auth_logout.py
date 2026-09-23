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
          "/api/auth/mobile/login/",
          {
              "email": "alice@example.com",
              "password": "strong-password-123",
          },
          format="json",
      )
    
    refresh_token = login_response.json()["refresh"]

    logout_response = client.post(
          "/api/auth/mobile/logout/",
          {
              "refresh": refresh_token,
          },
          format="json",
      )
    
    assert logout_response.status_code == 204

    refresh_response = client.post(
          "/api/auth/mobile/refresh/",
          {
              "refresh": refresh_token,
          },
          format="json",
      )

    assert refresh_response.status_code == 401

def test_logout_requires_refresh_token():
      client = APIClient()

      response = client.post(
          "/api/auth/mobile/logout/",
          {},
          format="json",
      )

      assert response.status_code == 400

def test_logout_rejects_invalid_refresh_token():
      client = APIClient()

      response = client.post(
          "/api/auth/mobile/logout/",
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
          "/api/auth/web/login/",
          {
              "email": "alice@example.com",
              "password": "strong-password-123",
          },
          format="json",
      )

      csrf_response = client.get("/api/auth/csrf/")
      csrf_token = csrf_response.cookies["csrftoken"].value
      refresh_token = login_response.cookies["refresh_token"].value

      response = client.post(
          "/api/auth/web/logout/",
          {},
          format="json",
          HTTP_COOKIE=f"csrftoken={csrf_token}; refresh_token={refresh_token}",
          HTTP_X_CSRFTOKEN=csrf_token,
      )

      assert response.status_code == 204


def test_logout_clears_refresh_token_cookie():
      client = APIClient()
      get_user_model().objects.create_user(
          email="alice@example.com",
          password="strong-password-123",
      )

      login_response = client.post(
          "/api/auth/web/login/",
          {
              "email": "alice@example.com",
              "password": "strong-password-123",
          },
          format="json",
      )

      csrf_response = client.get("/api/auth/csrf/")
      csrf_token = csrf_response.cookies["csrftoken"].value
      refresh_token = login_response.cookies["refresh_token"].value

      response = client.post(
          "/api/auth/web/logout/",
          {},
          format="json",
          HTTP_COOKIE=f"csrftoken={csrf_token}; refresh_token={refresh_token}",
          HTTP_X_CSRFTOKEN=csrf_token,
      )

      assert response.status_code == 204
      assert "refresh_token" in response.cookies
      assert response.cookies["refresh_token"].value == ""


def test_logout_cookie_requires_csrf():
      client = APIClient(enforce_csrf_checks=True)
      get_user_model().objects.create_user(
          email="alice@example.com",
          password="strong-password-123",
      )

      login_response = client.post(
          "/api/auth/web/login/",
          {
              "email": "alice@example.com",
              "password": "strong-password-123",
          },
          format="json",
      )

      refresh_token = login_response.cookies["refresh_token"].value

      response = client.post(
          "/api/auth/web/logout/",
          {},
          format="json",
          HTTP_COOKIE=f"refresh_token={refresh_token}",
      )

      assert response.status_code == 403
