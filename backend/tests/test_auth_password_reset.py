import pytest
from django.contrib.auth import get_user_model
from django.core.cache import cache
from rest_framework import status
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken
from urllib.parse import parse_qs, urlparse


pytestmark = pytest.mark.django_db


@pytest.fixture(autouse=True)
def clear_password_reset_throttle_cache():
    cache.clear()


def test_password_reset_request_sends_link_for_existing_user(mailoutbox):
    get_user_model().objects.create_user(
        email="person@example.com",
        password="old-strong-password-123",
    )

    response = APIClient().post(
        "/api/auth/password/request/",
        {"email": "person@example.com"},
        format="json",
    )

    assert response.status_code == status.HTTP_202_ACCEPTED
    assert response.json() == {
        "detail": "If an account exists for that email, a reset link has been sent."
    }
    assert len(mailoutbox) == 1
    assert mailoutbox[0].to == ["person@example.com"]
    assert "/reset-password?uid=" in mailoutbox[0].body
    assert "&token=" in mailoutbox[0].body


def test_password_reset_request_does_not_reveal_unknown_email(mailoutbox):
    response = APIClient().post(
        "/api/auth/password/request/",
        {"email": "unknown@example.com"},
        format="json",
    )

    assert response.status_code == status.HTTP_202_ACCEPTED
    assert response.json() == {
        "detail": "If an account exists for that email, a reset link has been sent."
    }
    assert mailoutbox == []


def test_password_reset_request_does_not_reveal_email_delivery_failure(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    get_user_model().objects.create_user(
        email="person@example.com",
        password="old-strong-password-123",
    )

    def fail_to_send_email(**_kwargs: object) -> None:
        raise RuntimeError("delivery failed for person@example.com")

    logged_messages: list[str] = []
    monkeypatch.setattr("apps.users.services.send_mail", fail_to_send_email)

    def record_log(message: str, provider_error_type: str) -> None:
        logged_messages.append(message % provider_error_type)

    monkeypatch.setattr("apps.users.views.logger.error", record_log)

    response = APIClient().post(
        "/api/auth/password/request/",
        {"email": "person@example.com"},
        format="json",
    )

    assert response.status_code == status.HTTP_202_ACCEPTED
    assert response.json() == {
        "detail": "If an account exists for that email, a reset link has been sent."
    }
    assert logged_messages == [
        "Password reset email delivery failed (RuntimeError)"
    ]
    assert "person@example.com" not in logged_messages[0]


def test_password_reset_confirm_changes_password(mailoutbox):
    user = get_user_model().objects.create_user(
        email="person@example.com",
        password="old-strong-password-123",
    )
    client = APIClient()
    client.post(
        "/api/auth/password/request/",
        {"email": "person@example.com"},
        format="json",
    )
    reset_url = mailoutbox[0].body.splitlines()[2]
    reset_query = parse_qs(urlparse(reset_url).query)

    response = client.post(
        "/api/auth/password/confirm/",
        {
            "uid": reset_query["uid"][0],
            "token": reset_query["token"][0],
            "new_password": "new-strong-password-456",
        },
        format="json",
    )

    assert response.status_code == status.HTTP_204_NO_CONTENT
    user.refresh_from_db()
    assert user.check_password("new-strong-password-456") is True


def test_password_reset_confirm_rejects_used_token(mailoutbox):
    get_user_model().objects.create_user(
        email="person@example.com",
        password="old-strong-password-123",
    )
    client = APIClient()
    client.post(
        "/api/auth/password/request/",
        {"email": "person@example.com"},
        format="json",
    )
    reset_url = mailoutbox[0].body.splitlines()[2]
    reset_query = parse_qs(urlparse(reset_url).query)
    payload = {
        "uid": reset_query["uid"][0],
        "token": reset_query["token"][0],
        "new_password": "new-strong-password-456",
    }
    assert client.post(
        "/api/auth/password/confirm/", payload, format="json"
    ).status_code == status.HTTP_204_NO_CONTENT

    replay = client.post(
        "/api/auth/password/confirm/", payload, format="json"
    )

    assert replay.status_code == status.HTTP_400_BAD_REQUEST
    assert replay.json() == {"token": ["Reset link is invalid or expired."]}


def test_password_reset_confirm_revokes_existing_refresh_tokens(mailoutbox):
    user = get_user_model().objects.create_user(
        email="person@example.com",
        password="old-strong-password-123",
    )
    old_refresh = str(RefreshToken.for_user(user))
    client = APIClient()
    client.post(
        "/api/auth/password/request/",
        {"email": "person@example.com"},
        format="json",
    )
    reset_url = mailoutbox[0].body.splitlines()[2]
    reset_query = parse_qs(urlparse(reset_url).query)

    reset_response = client.post(
        "/api/auth/password/confirm/",
        {
            "uid": reset_query["uid"][0],
            "token": reset_query["token"][0],
            "new_password": "new-strong-password-456",
        },
        format="json",
    )
    refresh_response = client.post(
        "/api/auth/mobile/refresh/",
        {"refresh": old_refresh},
        format="json",
    )

    assert reset_response.status_code == status.HTTP_204_NO_CONTENT
    assert refresh_response.status_code == status.HTTP_401_UNAUTHORIZED


def test_password_reset_request_is_limited_to_three_per_hour():
    client = APIClient()
    payload = {"email": "unknown@example.com"}

    responses = [
        client.post("/api/auth/password/request/", payload, format="json")
        for _ in range(4)
    ]

    assert [response.status_code for response in responses] == [202, 202, 202, 429]


def test_authenticated_client_cannot_bypass_password_reset_limit():
    user = get_user_model().objects.create_user(
        email="signed-in@example.com",
        password="old-strong-password-123",
    )
    client = APIClient()
    client.force_authenticate(user=user)
    payload = {"email": "unknown@example.com"}

    responses = [
        client.post("/api/auth/password/request/", payload, format="json")
        for _ in range(4)
    ]

    assert [response.status_code for response in responses] == [202, 202, 202, 429]


def test_password_reset_confirm_rejects_weak_password(mailoutbox):
    user = get_user_model().objects.create_user(
        email="person@example.com",
        password="old-strong-password-123",
    )
    client = APIClient()
    client.post(
        "/api/auth/password/request/",
        {"email": "person@example.com"},
        format="json",
    )
    reset_url = mailoutbox[0].body.splitlines()[2]
    reset_query = parse_qs(urlparse(reset_url).query)

    response = client.post(
        "/api/auth/password/confirm/",
        {
            "uid": reset_query["uid"][0],
            "token": reset_query["token"][0],
            "new_password": "123",
        },
        format="json",
    )

    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert response.json() == {
        "new_password": [
            "This password is too short. It must contain at least 8 characters.",
            "This password is too common.",
            "This password is entirely numeric.",
        ]
    }
    user.refresh_from_db()
    assert user.check_password("old-strong-password-123") is True
