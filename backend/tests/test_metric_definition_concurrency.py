from concurrent.futures import ThreadPoolExecutor
from threading import Event, local
from unittest.mock import patch

import pytest
from django.contrib.auth import get_user_model
from django.db import close_old_connections, connections, transaction
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from apps.metrics.limits import get_active_custom_metric_usage
from apps.metrics.models import MetricDefinition


# Real commits and independent connections are required to exercise row locking.
'''
A normal django_db test wraps everything in one test transaction. transaction=True
  allows real commits, locks, and independent database connections, which concurrency
  testing requires.
'''
pytestmark = pytest.mark.django_db(transaction=True)


def test_concurrent_creates_cannot_both_claim_final_active_custom_metric_slot():
    user = get_user_model().objects.create_user(
        email="alice@example.com",
        password="strong-password-123",
    )
    access_token = str(RefreshToken.for_user(user).access_token)

    # Two active definitions leave exactly one slot under the MVP limit of three.
    for index in range(2):
        MetricDefinition.objects.create(
            user=user,
            name=f"Existing Metric {index}",
            slug=f"existing_metric_{index}",
            unit="score",
            category=MetricDefinition.Category.CUSTOM,
            min_value=1,
            max_value=10,
            is_default=False,
            is_active=True,
        )

    # Events make the race reproducible instead of depending on thread timing.
    first_request_created = Event()
    release_first_transaction = Event()
    second_request_started = Event()
    second_request_counted = Event()
    request_state = local()

    def usage_with_controlled_race(request_user):
        usage = get_active_custom_metric_usage(request_user)

        if getattr(request_state, "is_second_request", False):
            # Hold the second request after it reads the stale count of two.
            second_request_counted.set()
            release_first_transaction.wait(timeout=5)

        return usage

    def post_metric(slug: str) -> tuple[int, dict[str, object]]:
        client = APIClient()
        client.credentials(HTTP_AUTHORIZATION=f"Bearer {access_token}")

        response = client.post(
            "/api/v1/metrics/definitions/",
            {
                "name": slug.replace("_", " ").title(),
                "slug": slug,
                "unit": "score",
                "category": "custom",
                "min_value": 1,
                "max_value": 10,
            },
            format="json",
        )

        return response.status_code, response.json()

    def create_first_metric() -> tuple[int, dict[str, object]]:
        # Each worker must use its own database connection, like separate requests.
        close_old_connections()

        try:
            with transaction.atomic():
                # The production write path will need to acquire this same lock.
                get_user_model().objects.select_for_update().get(pk=user.pk)
                result = post_metric("final_slot_a")
                first_request_created.set()
                release_first_transaction.wait(timeout=5)
                return result
        finally:
            connections.close_all()

    def create_second_metric() -> tuple[int, dict[str, object]]:
        close_old_connections()
        request_state.is_second_request = True
        second_request_started.set()

        try:
            return post_metric("final_slot_b")
        finally:
            connections.close_all()

    with patch(
        "apps.metrics.limits.get_active_custom_metric_usage",
        side_effect=usage_with_controlled_race,
    ):
        with ThreadPoolExecutor(max_workers=2) as executor:
            first_future = executor.submit(create_first_metric)

            try:
                assert first_request_created.wait(timeout=5)

                second_future = executor.submit(create_second_metric)
                assert second_request_started.wait(timeout=5)

                # Unsafe code reaches the stale count and pauses here. Correct
                # code blocks on the user lock and counts only after release.
                second_request_counted.wait(timeout=1)
            finally:
                # Always unblock the first transaction, even if an assertion fails.
                release_first_transaction.set()

            first_status, _ = first_future.result(timeout=5)
            second_status, second_payload = second_future.result(timeout=5)

    assert sorted([first_status, second_status]) == [201, 400]
    assert second_payload == {
        "non_field_errors": ["Active custom metric limit reached."]
    }
    assert (
        MetricDefinition.objects.filter(
            user=user,
            is_default=False,
            is_active=True,
        ).count()
        == 3
    )
