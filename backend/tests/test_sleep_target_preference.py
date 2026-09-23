import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken


pytestmark = pytest.mark.django_db


def authenticate_user(
    email: str = "sleep-target@example.com",
) -> tuple[APIClient, object]:
    user = get_user_model().objects.create_user(
        email=email,
        password="strong-password-123",
    )
    client = APIClient()
    client.credentials(
        HTTP_AUTHORIZATION=f"Bearer {RefreshToken.for_user(user).access_token}"
    )
    return client, user


def test_authenticated_user_reads_default_sleep_target() -> None:
    client, _user = authenticate_user()

    response = client.get("/api/v1/metrics/preferences/sleep/")

    assert response.status_code == 200
    assert response.json() == {"target_minutes": 450}


def test_authenticated_user_saves_and_reads_sleep_target() -> None:
    client, user = authenticate_user()

    update_response = client.patch(
        "/api/v1/metrics/preferences/sleep/",
        {"target_minutes": 480},
        format="json",
    )
    read_response = client.get("/api/v1/metrics/preferences/sleep/")

    assert update_response.status_code == 200
    assert update_response.json() == {"target_minutes": 480}
    assert read_response.json() == {"target_minutes": 480}
    user.refresh_from_db()
    assert user.sleep_target_minutes == 480


@pytest.mark.parametrize("target_minutes", [59, 1440, 7.5, "eight hours"])
def test_invalid_sleep_target_is_rejected_without_changing_value(
    target_minutes: object,
) -> None:
    client, user = authenticate_user()

    response = client.patch(
        "/api/v1/metrics/preferences/sleep/",
        {"target_minutes": target_minutes},
        format="json",
    )

    assert response.status_code == 400
    user.refresh_from_db()
    assert user.sleep_target_minutes == 450


def test_sleep_target_update_is_scoped_to_authenticated_user() -> None:
    client, user = authenticate_user()
    other_user = get_user_model().objects.create_user(
        email="other-sleep-target@example.com",
        password="strong-password-123",
        sleep_target_minutes=510,
    )

    response = client.patch(
        "/api/v1/metrics/preferences/sleep/",
        {"target_minutes": 480},
        format="json",
    )

    assert response.status_code == 200
    user.refresh_from_db()
    other_user.refresh_from_db()
    assert user.sleep_target_minutes == 480
    assert other_user.sleep_target_minutes == 510


def test_sleep_target_preference_requires_authentication() -> None:
    response = APIClient().get("/api/v1/metrics/preferences/sleep/")

    assert response.status_code == 401
