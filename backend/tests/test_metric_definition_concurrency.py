from concurrent.futures import ThreadPoolExecutor
from threading import Event, local
from unittest.mock import patch

import pytest
from django.contrib.auth import get_user_model
from django.db import close_old_connections, connections, transaction
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from apps.metrics.limits import (
    get_active_custom_metric_usage,
    validate_active_custom_metric_limit,
)
from apps.metrics.models import MetricDefinition
from apps.subscriptions.models import Subscription, SubscriptionPlan


# Real commits and independent connections are required to exercise row locking.
pytestmark = pytest.mark.django_db(transaction=True)


def create_authenticated_user(email: str) -> tuple[object, str]:
    user = get_user_model().objects.create_user(
        email=email,
        password="strong-password-123",
    )
    # transaction=True flushes table rows between tests without rerunning data
    # migrations, so restore the canonical seed row for each concurrency test.
    free_plan, _created = SubscriptionPlan.objects.get_or_create(
        code="free",
        defaults={
            "name": "Free",
            "active_custom_metric_limit": 3,
            "wearable_connection_limit": 0,
            "sync_interval_minutes": 60,
            "analytics_enabled": False,
            "csv_import_enabled": False,
            "is_default": True,
            "is_active": True,
        },
    )
    Subscription.objects.create(
        user=user,
        plan=free_plan,
        status=Subscription.Status.ACTIVE,
    )
    access_token = str(RefreshToken.for_user(user).access_token)
    return user, access_token


def create_custom_metric(
    user: object,
    slug: str,
    *,
    is_active: bool,
) -> MetricDefinition:
    return MetricDefinition.objects.create(
        user=user,
        name=slug.replace("_", " ").title(),
        slug=slug,
        unit="score",
        category=MetricDefinition.Category.CUSTOM,
        min_value=1,
        max_value=10,
        is_default=False,
        is_active=is_active,
    )


def authenticated_client(access_token: str) -> APIClient:
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {access_token}")
    return client


def assert_final_slot_result(
    *,
    user: object,
    statuses: list[int],
    rejected_payload: dict[str, object],
    success_status: int,
) -> None:
    assert sorted(statuses) == [success_status, 400]
    assert rejected_payload == {
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


def test_concurrent_creates_cannot_both_claim_final_active_custom_metric_slot():
    user, access_token = create_authenticated_user("alice@example.com")

    # Two active definitions leave exactly one slot under the MVP limit of three.
    for index in range(2):
        create_custom_metric(
            user,
            f"existing_metric_{index}",
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
        response = authenticated_client(access_token).post(
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

    assert_final_slot_result(
        user=user,
        statuses=[first_status, second_status],
        rejected_payload=second_payload,
        success_status=201,
    )


def test_concurrent_reactivations_cannot_both_claim_final_active_custom_metric_slot():
    user, access_token = create_authenticated_user("reactivation@example.com")

    for index in range(2):
        create_custom_metric(
            user,
            f"existing_metric_{index}",
            is_active=True,
        )

    archived_metrics = [
        create_custom_metric(
            user,
            f"archived_metric_{index}",
            is_active=False,
        )
        for index in range(2)
    ]

    first_request_updated = Event()
    release_first_transaction = Event()
    second_request_started = Event()
    second_request_validated = Event()
    request_state = local()

    def validation_with_controlled_race(
        request_user,
        *,
        excluding_definition=None,
    ):
        # Run the real validation, then pause the second request after it has
        # accepted the stale count of two active custom metrics.
        validate_active_custom_metric_limit(
            request_user,
            excluding_definition=excluding_definition,
        )

        if getattr(request_state, "is_second_request", False):
            second_request_validated.set()
            release_first_transaction.wait(timeout=5)

    def reactivate_metric(
        definition: MetricDefinition,
    ) -> tuple[int, dict[str, object]]:
        response = authenticated_client(access_token).patch(
            f"/api/v1/metrics/definitions/{definition.id}/",
            {"is_active": True},
            format="json",
        )

        return response.status_code, response.json()

    def reactivate_first_metric() -> tuple[int, dict[str, object]]:
        close_old_connections()

        try:
            with transaction.atomic():
                # Hold the per-user lock that the production update path must
                # acquire before validating and reactivating.
                get_user_model().objects.select_for_update().get(pk=user.pk)

                result = reactivate_metric(archived_metrics[0])
                first_request_updated.set()
                release_first_transaction.wait(timeout=5)
                return result
        finally:
            connections.close_all()

    def reactivate_second_metric() -> tuple[int, dict[str, object]]:
        close_old_connections()
        request_state.is_second_request = True
        second_request_started.set()

        try:
            return reactivate_metric(archived_metrics[1])
        finally:
            connections.close_all()

    with patch(
        "apps.metrics.serializers.validate_active_custom_metric_limit",
        side_effect=validation_with_controlled_race,
    ):
        with ThreadPoolExecutor(max_workers=2) as executor:
            first_future = executor.submit(reactivate_first_metric)

            try:
                assert first_request_updated.wait(timeout=5)

                second_future = executor.submit(reactivate_second_metric)
                assert second_request_started.wait(timeout=5)

                # Unsafe code validates before acquiring a lock. Correct code
                # blocks on the user row until the first transaction commits.
                second_request_validated.wait(timeout=1)
            finally:
                release_first_transaction.set()

            first_status, _ = first_future.result(timeout=5)
            second_status, second_payload = second_future.result(timeout=5)

    assert_final_slot_result(
        user=user,
        statuses=[first_status, second_status],
        rejected_payload=second_payload,
        success_status=200,
    )
