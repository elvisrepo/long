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
    assert set(response.json().keys()) == {"access", "refresh"}


def test_refresh_rejects_invalid_refresh_token():
      client = APIClient()

      response = client.post(
          "/api/auth/refresh/",
          {
              "refresh": "not-a-real-refresh-token",
          },
      )

      assert response.status_code == 401

def test_refresh_accepts_refresh_token_from_cookie():
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
          "/api/auth/refresh/",
          {},
          format="json",
          HTTP_COOKIE=f"refresh_token={refresh_token}",
      )

      assert response.status_code == 200
      assert "access" in response.json()


def test_refresh_rotates_refresh_token_cookie():
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

      original_refresh = login_response.cookies["refresh_token"].value

      response = client.post(
          "/api/auth/refresh/",
          {},
          format="json",
          HTTP_COOKIE=f"refresh_token={original_refresh}",
      )

      assert response.status_code == 200
      assert "refresh_token" in response.cookies
      assert response.cookies["refresh_token"].value != original_refresh


def test_refresh_cookie_requires_csrf():
      client = APIClient(enforce_csrf_checks=True)
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
          "/api/auth/refresh/",
          {},
          format="json",
          HTTP_COOKIE=f"refresh_token={refresh_token}",
      )

      assert response.status_code == 403


def test_refresh_cookie_succeeds_with_csrf():
      client = APIClient(enforce_csrf_checks=True)
      get_user_model().objects.create_user(
          email="alice@example.com",
          password="strong-password-123",
      )

      csrf_response = client.get("/api/auth/csrf/")
      csrf_token = csrf_response.cookies["csrftoken"].value

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
          "/api/auth/refresh/",
          {},
          format="json",
          HTTP_COOKIE=f"csrftoken={csrf_token}; refresh_token={refresh_token}",
          HTTP_X_CSRFTOKEN=csrf_token,
      )

      assert response.status_code == 200
      assert "access" in response.json()