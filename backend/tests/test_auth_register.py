import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient


pytestmark = pytest.mark.django_db


def test_register_creates_user_and_returns_201():
      client = APIClient()

      response = client.post(
          "/api/auth/register/",
          {
              "email": "alice@example.com",
              "password": "strong-password-123",
          },
          format="json",
      )

      assert response.status_code == 201
      assert response.json() == {
          "email": "alice@example.com",
      }

      User = get_user_model()
      user = User.objects.get(email_lookup_hash__isnull=False)

      assert user.email == "alice@example.com"
      assert user.check_password("strong-password-123") is True