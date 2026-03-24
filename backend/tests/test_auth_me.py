import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient


pytestmark = pytest.mark.django_db


def test_me_returns_authenticated_user_email():
    client = APIClient()
    User = get_user_model()

    User.objects.create_user(
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

    access_token = login_response.json()["access"]
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {access_token}")

    response = client.get("/api/auth/me/")

    assert response.status_code == 200
    assert response.json() == {
        "email": "alice@example.com",
    }


def test_me_requires_authentication():
    client = APIClient()

    response = client.get("/api/auth/me/")

    assert response.status_code == 401
