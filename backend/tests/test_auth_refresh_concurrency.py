from concurrent.futures import ThreadPoolExecutor
from threading import Event
from typing import Callable
from unittest.mock import patch

import pytest
from django.contrib.auth import get_user_model
from django.db import close_old_connections, connections
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken


# Separate committed transactions and connections are required to reproduce
# concurrent requests against SimpleJWT's PostgreSQL blacklist tables.
pytestmark = pytest.mark.django_db(transaction=True)


def assert_one_concurrent_rotation(
    post_refresh: Callable[[], tuple[int, dict[str, object]]],
) -> None:
    first_token_checked = Event()
    second_token_checked = Event()
    original_check_blacklist = RefreshToken.check_blacklist

    def coordinate_after_blacklist_check(token: RefreshToken) -> None:
        # Force both unsafe requests to observe the token as valid before either
        # can blacklist it. Correct code blocks the second request earlier on
        # the OutstandingToken row, so only the first reaches this pause.
        original_check_blacklist(token)
        if not first_token_checked.is_set():
            first_token_checked.set()
            second_token_checked.wait(timeout=1)
        else:
            second_token_checked.set()

    def post_on_independent_connection() -> tuple[int, dict[str, object]]:
        close_old_connections()
        try:
            return post_refresh()
        finally:
            connections.close_all()

    with patch.object(
        RefreshToken,
        "check_blacklist",
        new=coordinate_after_blacklist_check,
    ):
        with ThreadPoolExecutor(max_workers=2) as executor:
            futures = [
                executor.submit(post_on_independent_connection)
                for _index in range(2)
            ]
            results = [future.result(timeout=5) for future in futures]

    statuses = sorted(status for status, _payload in results)
    rejected_payloads = [
        payload for status, payload in results if status == 401
    ]

    assert statuses == [200, 401]
    assert rejected_payloads == [{"detail": "Token is invalid."}]


def test_same_mobile_refresh_token_can_rotate_only_once_concurrently() -> None:
    user = get_user_model().objects.create_user(
        email="concurrent-mobile-refresh@example.com",
        password="strong-password-123",
    )
    refresh_token = str(RefreshToken.for_user(user))

    def post_mobile_refresh() -> tuple[int, dict[str, object]]:
        response = APIClient().post(
            "/api/auth/mobile/refresh/",
            {"refresh": refresh_token},
            format="json",
        )
        return response.status_code, response.json()

    assert_one_concurrent_rotation(post_mobile_refresh)


def test_same_web_refresh_cookie_can_rotate_only_once_concurrently() -> None:
    user = get_user_model().objects.create_user(
        email="concurrent-web-refresh@example.com",
        password="strong-password-123",
    )
    refresh_token = str(RefreshToken.for_user(user))
    csrf_client = APIClient()
    csrf_token = csrf_client.get("/api/auth/csrf/").cookies["csrftoken"].value

    def post_web_refresh() -> tuple[int, dict[str, object]]:
        response = APIClient(enforce_csrf_checks=True).post(
            "/api/auth/web/refresh/",
            {},
            format="json",
            HTTP_COOKIE=(
                f"csrftoken={csrf_token}; refresh_token={refresh_token}"
            ),
            HTTP_X_CSRFTOKEN=csrf_token,
        )
        return response.status_code, response.json()

    assert_one_concurrent_rotation(post_web_refresh)
