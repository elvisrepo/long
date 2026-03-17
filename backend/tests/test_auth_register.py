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

def test_register_rejects_duplicate_email():
      client = APIClient()
      User = get_user_model()

      User.objects.create_user(
          email="alice@example.com",
          password="strong-password-123",
      )

      # try to register with duplicate email
      response = client.post(
          "/api/auth/register/",
          {
              "email": "ALICE@example.com",
              "password": "another-strong-password-123",
          },
          format="json",
      )

      assert response.status_code == 400
      assert response.json() == {
        "email": ["A user with that email already exists."],
  }