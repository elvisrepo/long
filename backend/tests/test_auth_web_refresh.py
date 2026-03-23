import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient


pytestmark = pytest.mark.django_db


def test_web_refresh_succeeds_with_cookie_and_csrf():
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
          "/api/auth/web/refresh/",
          {},
          format="json",
          HTTP_COOKIE=f"csrftoken={csrf_token}; refresh_token={refresh_token}",
          HTTP_X_CSRFTOKEN=csrf_token,
      )

      assert response.status_code == 200
      assert "access" in response.json()