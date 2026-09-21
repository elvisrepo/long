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
        email="analytics-pro@example.com",
        password="strong-password-123",
    )
    plan = SubscriptionPlan.objects.create(
        code="analytics-pro",
        name="Analytics Pro",
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
    access_token = RefreshToken.for_user(user).access_token
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {access_token}")
    return client, user


def test_pro_user_receives_daily_latest_weight_and_summed_steps() -> None:
    client, user = authenticate_pro_user()
    weight = MetricDefinition.objects.get(slug="body_weight", user=None)
    steps = MetricDefinition.objects.get(slug="steps", user=None)
    today = timezone.now().replace(hour=0, minute=0, second=0, microsecond=0)
    yesterday = today - timedelta(days=1)

    MetricEntry.objects.create(
        user=user,
        metric_definition=weight,
        value=70.4,
        recorded_at=yesterday + timedelta(hours=7),
    )
    MetricEntry.objects.create(
        user=user,
        metric_definition=weight,
        value=70.1,
        recorded_at=yesterday + timedelta(hours=20),
    )
    MetricEntry.objects.create(
        user=user,
        metric_definition=steps,
        value=3200,
        recorded_at=yesterday + timedelta(hours=12),
    )
    MetricEntry.objects.create(
        user=user,
        metric_definition=steps,
        value=4100,
        recorded_at=yesterday + timedelta(hours=22),
    )

    response = client.get("/api/v1/metrics/analytics/weight-steps/?days=7")

    assert response.status_code == 200
    assert response.json() == {
        "range_days": 7,
        "series": [
            {
                "date": yesterday.date().isoformat(),
                "weight_kg": 70.1,
                "steps": 7300,
            }
        ],
        "summary": {
            "weight_start_kg": 70.1,
            "weight_end_kg": 70.1,
            "weight_change_kg": 0.0,
            "average_daily_steps": 7300,
        },
    }


def test_free_user_cannot_read_weight_steps_analytics() -> None:
    user = get_user_model().objects.create_user(
        email="analytics-free@example.com",
        password="strong-password-123",
    )
    free_plan = SubscriptionPlan.objects.get(code="free")
    Subscription.objects.create(
        user=user,
        plan=free_plan,
        status=Subscription.Status.ACTIVE,
    )
    client = APIClient()
    access_token = RefreshToken.for_user(user).access_token
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {access_token}")

    response = client.get("/api/v1/metrics/analytics/weight-steps/?days=30")

    assert response.status_code == 403
    assert response.json() == {"detail": "Pro analytics are required."}


def test_weight_steps_analytics_only_accepts_supported_ranges() -> None:
    client, _user = authenticate_pro_user()

    response = client.get("/api/v1/metrics/analytics/weight-steps/?days=14")

    assert response.status_code == 400
    assert response.json() == {"days": ["Choose one of 7, 30, or 90 days."]}


def test_weight_steps_analytics_requires_authentication() -> None:
    response = APIClient().get("/api/v1/metrics/analytics/weight-steps/?days=30")

    assert response.status_code == 401


def test_weight_steps_analytics_excludes_another_users_entries() -> None:
    client, _user = authenticate_pro_user()
    other_user = get_user_model().objects.create_user(
        email="other-analytics-user@example.com",
        password="strong-password-123",
    )
    weight = MetricDefinition.objects.get(slug="body_weight", user=None)
    MetricEntry.objects.create(
        user=other_user,
        metric_definition=weight,
        value=88.8,
        recorded_at=timezone.now() - timedelta(hours=1),
    )

    response = client.get("/api/v1/metrics/analytics/weight-steps/?days=7")

    assert response.status_code == 200
    assert response.json()["series"] == []


def test_weight_steps_analytics_returns_null_summaries_when_period_is_empty() -> None:
    client, _user = authenticate_pro_user()

    response = client.get("/api/v1/metrics/analytics/weight-steps/?days=90")

    assert response.status_code == 200
    assert response.json() == {
        "range_days": 90,
        "series": [],
        "summary": {
            "weight_start_kg": None,
            "weight_end_kg": None,
            "weight_change_kg": None,
            "average_daily_steps": None,
        },
    }


def test_weight_steps_analytics_ignores_user_metrics_with_default_slugs() -> None:
    client, user = authenticate_pro_user()
    custom_weight = MetricDefinition.objects.create(
        user=user,
        name="Custom Body Weight",
        slug="body_weight",
        unit="score",
        category=MetricDefinition.Category.CUSTOM,
        min_value=0,
        max_value=1000,
        is_default=False,
    )
    MetricEntry.objects.create(
        user=user,
        metric_definition=custom_weight,
        value=999,
        recorded_at=timezone.now() - timedelta(hours=1),
    )

    response = client.get("/api/v1/metrics/analytics/weight-steps/?days=7")

    assert response.status_code == 200
    assert response.json()["series"] == []
