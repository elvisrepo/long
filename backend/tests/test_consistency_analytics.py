from datetime import timedelta

import pytest
from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from apps.metrics.models import MetricDefinition, MetricEntry
from apps.subscriptions.models import Subscription, SubscriptionPlan


pytestmark = pytest.mark.django_db


def authenticate_pro_user() -> tuple[APIClient, object]:
    user = get_user_model().objects.create_user(
        email="consistency-pro@example.com",
        password="strong-password-123",
    )
    plan = SubscriptionPlan.objects.create(
        code="consistency-pro",
        name="Consistency Pro",
        active_custom_metric_limit=10,
        wearable_connection_limit=2,
        automatic_sync_enabled=True,
        sync_interval_minutes=15,
        analytics_enabled=True,
        csv_import_enabled=True,
    )
    Subscription.objects.create(
        user=user,
        plan=plan,
        status=Subscription.Status.ACTIVE,
    )
    client = APIClient()
    client.credentials(
        HTTP_AUTHORIZATION=f"Bearer {RefreshToken.for_user(user).access_token}"
    )
    return client, user


def test_pro_user_receives_seven_day_metric_presence() -> None:
    client, user = authenticate_pro_user()
    weight = MetricDefinition.objects.get(slug="body_weight", user=None)
    today = timezone.now().replace(hour=0, minute=0, second=0, microsecond=0)
    yesterday = today - timedelta(days=1)
    MetricEntry.objects.create(
        user=user,
        metric_definition=weight,
        value=80.1,
        recorded_at=yesterday + timedelta(hours=7),
    )

    response = client.get("/api/v1/metrics/analytics/consistency/")

    assert response.status_code == 200
    data = response.json()
    assert data["range_days"] == 7
    assert data["dates"] == [
        (today - timedelta(days=days_ago)).date().isoformat()
        for days_ago in reversed(range(7))
    ]
    weight_data = next(
        metric for metric in data["metrics"] if metric["slug"] == "body_weight"
    )
    assert weight_data == {
        "metric_definition_id": str(weight.id),
        "name": "Body Weight",
        "slug": "body_weight",
        "tracked_days": 1,
        "current_window_streak_days": 0,
        "last_recorded_at": (yesterday + timedelta(hours=7))
        .isoformat()
        .replace("+00:00", "Z"),
        "day_presence": [False, False, False, False, False, True, False],
    }
    assert data["summary"]["metrics_with_data"] == 1
    assert data["summary"]["days_with_any_data"] == 1


def test_multiple_entries_on_one_day_count_once_and_streak_ends_today() -> None:
    client, user = authenticate_pro_user()
    steps = MetricDefinition.objects.get(slug="steps", user=None)
    today = timezone.now().replace(hour=0, minute=0, second=0, microsecond=0)
    for days_ago, hour in ((2, 9), (1, 8), (1, 20)):
        MetricEntry.objects.create(
            user=user,
            metric_definition=steps,
            value=1000,
            recorded_at=today - timedelta(days=days_ago) + timedelta(hours=hour),
        )
    MetricEntry.objects.create(
        user=user,
        metric_definition=steps,
        value=1000,
        recorded_at=timezone.now() - timedelta(hours=1),
    )

    response = client.get("/api/v1/metrics/analytics/consistency/")

    steps_data = next(
        metric for metric in response.json()["metrics"] if metric["slug"] == "steps"
    )
    assert steps_data["tracked_days"] == 3
    assert steps_data["current_window_streak_days"] == 3
    assert steps_data["day_presence"] == [False, False, False, False, True, True, True]


def test_latest_entry_can_precede_window_while_empty_metrics_remain_visible() -> None:
    client, user = authenticate_pro_user()
    weight = MetricDefinition.objects.get(slug="body_weight", user=None)
    old_recorded_at = timezone.now() - timedelta(days=20)
    MetricEntry.objects.create(
        user=user,
        metric_definition=weight,
        value=79.5,
        recorded_at=old_recorded_at,
    )

    response = client.get("/api/v1/metrics/analytics/consistency/")

    data = response.json()
    weight_data = next(
        metric for metric in data["metrics"] if metric["slug"] == "body_weight"
    )
    assert weight_data["tracked_days"] == 0
    assert weight_data["current_window_streak_days"] == 0
    assert weight_data["last_recorded_at"] == old_recorded_at.isoformat().replace(
        "+00:00", "Z"
    )
    assert weight_data["day_presence"] == [False] * 7
    assert data["summary"] == {
        "metrics_with_data": 0,
        "total_metrics": MetricDefinition.objects.filter(
            user=None,
            is_default=True,
            is_active=True,
        ).count(),
        "days_with_any_data": 0,
    }


def test_active_custom_metric_is_included_and_inactive_custom_metric_is_excluded() -> (
    None
):
    client, user = authenticate_pro_user()
    active_metric = MetricDefinition.objects.create(
        user=user,
        name="Mood",
        slug="mood",
        unit="score",
        category=MetricDefinition.Category.CUSTOM,
        min_value=1,
        max_value=10,
        is_default=False,
        is_active=True,
    )
    MetricDefinition.objects.create(
        user=user,
        name="Archived Metric",
        slug="archived_metric",
        unit="score",
        category=MetricDefinition.Category.CUSTOM,
        min_value=1,
        max_value=10,
        is_default=False,
        is_active=False,
    )
    MetricEntry.objects.create(
        user=user,
        metric_definition=active_metric,
        value=8,
        recorded_at=timezone.now() - timedelta(hours=1),
    )

    response = client.get("/api/v1/metrics/analytics/consistency/")

    slugs = [metric["slug"] for metric in response.json()["metrics"]]
    assert "mood" in slugs
    assert "archived_metric" not in slugs


def test_consistency_excludes_another_users_data_and_future_entries() -> None:
    client, user = authenticate_pro_user()
    other_user = get_user_model().objects.create_user(
        email="other-consistency@example.com",
        password="strong-password-123",
    )
    weight = MetricDefinition.objects.get(slug="body_weight", user=None)
    MetricEntry.objects.create(
        user=other_user,
        metric_definition=weight,
        value=92,
        recorded_at=timezone.now() - timedelta(hours=1),
    )
    MetricEntry.objects.create(
        user=user,
        metric_definition=weight,
        value=75,
        recorded_at=timezone.now() + timedelta(days=1),
    )

    response = client.get("/api/v1/metrics/analytics/consistency/")

    weight_data = next(
        metric
        for metric in response.json()["metrics"]
        if metric["slug"] == "body_weight"
    )
    assert weight_data["tracked_days"] == 0
    assert weight_data["last_recorded_at"] is None


def test_free_user_cannot_read_consistency_analytics() -> None:
    user = get_user_model().objects.create_user(
        email="consistency-free@example.com",
        password="strong-password-123",
    )
    Subscription.objects.create(
        user=user,
        plan=SubscriptionPlan.objects.get(code="free"),
        status=Subscription.Status.ACTIVE,
    )
    client = APIClient()
    client.credentials(
        HTTP_AUTHORIZATION=f"Bearer {RefreshToken.for_user(user).access_token}"
    )

    response = client.get("/api/v1/metrics/analytics/consistency/")

    assert response.status_code == 403
    assert response.json() == {"detail": "Pro analytics are required."}


def test_consistency_analytics_requires_authentication() -> None:
    response = APIClient().get("/api/v1/metrics/analytics/consistency/")

    assert response.status_code == 401
