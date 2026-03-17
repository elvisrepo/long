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
      

def test_register_requires_email_and_password():
      client = APIClient()

      response = client.post(
          "/api/auth/register/",
          {},
          format="json",
      )

      assert response.status_code == 400
      assert response.json() == {
          "email": ["This field is required."],
          "password": ["This field is required."],
      }

def test_register_rejects_invalid_email():
      client = APIClient()

      response = client.post(
          "/api/auth/register/",
          {
              "email": "not-an-email",
              "password": "strong-password-123",
          },
          format="json",
      )

      assert response.status_code == 400
      assert response.json() == {
          "email": ["Enter a valid email address."],
      }

def test_register_rejects_password_that_fails_django_validation():
      client = APIClient()

      response = client.post(
          "/api/auth/register/",
          {
              "email": "alice@example.com",
              "password": "123",
          },
          format="json",
      )

      assert response.status_code == 400
      assert response.json() == {
      "password": [
          "This password is too short. It must contain at least 8 characters.",
          "This password is too common.",
          "This password is entirely numeric.",
      ],
  }