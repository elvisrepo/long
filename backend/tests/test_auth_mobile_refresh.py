import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient


pytestmark = pytest.mark.django_db


def test_mobile_refresh_succeeds_with_refresh_token_in_body():
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

    response = client.post(
        "/api/auth/mobile/refresh/",
        {
            "refresh": refresh_token,
        },
        format="json",
    )

    assert response.status_code == 200
    assert "access" in response.json()
