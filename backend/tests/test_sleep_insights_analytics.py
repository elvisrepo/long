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
        email="sleep-analytics-pro@example.com",
        password="strong-password-123",
    )
    plan = SubscriptionPlan.objects.create(
        code="sleep-analytics-pro",
        name="Sleep Analytics Pro",
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


def test_pro_user_receives_sleep_summary_and_shortfall() -> None:
    client, user = authenticate_pro_user()
    sleep = MetricDefinition.objects.get(slug="sleep_duration", user=None)
    today = timezone.now().replace(hour=0, minute=0, second=0, microsecond=0)

    for days_ago, duration_hours in ((3, 6.0), (2, 8.0), (1, 7.0)):
        wake_time = today - timedelta(days=days_ago) + timedelta(hours=7)
        MetricEntry.objects.create(
            user=user,
            metric_definition=sleep,
            value=duration_hours,
            period_start=wake_time - timedelta(hours=duration_hours),
            recorded_at=wake_time,
        )

    response = client.get("/api/v1/metrics/analytics/sleep/?target_minutes=450")

    assert response.status_code == 200
    data = response.json()
    assert data["range_days"] == 7
    assert data["target_minutes"] == 450
    assert len(data["series"]) == 7
    tracked_points = [
        point for point in data["series"] if point["duration_minutes"] is not None
    ]
    assert [point["duration_minutes"] for point in tracked_points] == [
        360,
        480,
        420,
    ]
    assert [point["shortfall_minutes"] for point in tracked_points] == [
        90,
        0,
        30,
    ]
    assert data["summary"] == {
        "tracked_nights": 3,
        "nights_under_target": 2,
        "total_shortfall_minutes": 120,
        "average_duration_minutes": 420,
        "worst_night": {
            "date": (today - timedelta(days=3)).date().isoformat(),
            "duration_minutes": 360,
        },
    }


def test_sleep_insights_uses_latest_record_on_each_wake_date() -> None:
    client, user = authenticate_pro_user()
    sleep = MetricDefinition.objects.get(slug="sleep_duration", user=None)
    today = timezone.now().replace(hour=0, minute=0, second=0, microsecond=0)
    wake_date = today - timedelta(days=1)

    MetricEntry.objects.create(
        user=user,
        metric_definition=sleep,
        value=6,
        period_start=wake_date,
        recorded_at=wake_date + timedelta(hours=6),
    )
    latest = MetricEntry.objects.create(
        user=user,
        metric_definition=sleep,
        value=8,
        period_start=wake_date,
        recorded_at=wake_date + timedelta(hours=8),
    )

    response = client.get("/api/v1/metrics/analytics/sleep/")

    assert response.status_code == 200
    point = response.json()["series"][-2]
    assert point == {
        "date": wake_date.date().isoformat(),
        "duration_minutes": 480,
        "period_start": latest.period_start.isoformat().replace("+00:00", "Z"),
        "recorded_at": latest.recorded_at.isoformat().replace("+00:00", "Z"),
        "shortfall_minutes": 0,
    }


def test_sleep_insights_defaults_target_and_keeps_missing_nights_null() -> None:
    client, _user = authenticate_pro_user()

    response = client.get("/api/v1/metrics/analytics/sleep/")

    assert response.status_code == 200
    data = response.json()
    assert data["target_minutes"] == 450
    assert len(data["series"]) == 7
    assert all(
        point["duration_minutes"] is None and point["shortfall_minutes"] is None
        for point in data["series"]
    )
    assert data["summary"] == {
        "tracked_nights": 0,
        "nights_under_target": 0,
        "total_shortfall_minutes": 0,
        "average_duration_minutes": None,
        "worst_night": None,
    }


@pytest.mark.parametrize("target_minutes", ["59", "7.5", "1440"])
def test_sleep_insights_rejects_invalid_targets(target_minutes: str) -> None:
    client, _user = authenticate_pro_user()

    response = client.get(
        f"/api/v1/metrics/analytics/sleep/?target_minutes={target_minutes}"
    )

    assert response.status_code == 400
    assert response.json() == {
        "target_minutes": ["Choose a whole number from 60 to 1439."]
    }


def test_free_user_cannot_read_sleep_insights() -> None:
    user = get_user_model().objects.create_user(
        email="sleep-analytics-free@example.com",
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

    response = client.get("/api/v1/metrics/analytics/sleep/")

    assert response.status_code == 403
    assert response.json() == {"detail": "Pro analytics are required."}


def test_sleep_insights_requires_authentication() -> None:
    response = APIClient().get("/api/v1/metrics/analytics/sleep/")

    assert response.status_code == 401


def test_sleep_insights_excludes_other_users_and_custom_same_slug_metrics() -> None:
    client, user = authenticate_pro_user()
    other_user = get_user_model().objects.create_user(
        email="other-sleep-user@example.com",
        password="strong-password-123",
    )
    default_sleep = MetricDefinition.objects.get(slug="sleep_duration", user=None)
    custom_sleep = MetricDefinition.objects.create(
        user=user,
        name="Custom Sleep",
        slug="sleep_duration",
        unit="score",
        category=MetricDefinition.Category.CUSTOM,
        min_value=0,
        max_value=1000,
        is_default=False,
    )
    now = timezone.now()
    MetricEntry.objects.create(
        user=other_user,
        metric_definition=default_sleep,
        value=8,
        recorded_at=now,
    )
    MetricEntry.objects.create(
        user=user,
        metric_definition=custom_sleep,
        value=999,
        recorded_at=now,
    )

    response = client.get("/api/v1/metrics/analytics/sleep/")

    assert response.status_code == 200
    assert response.json()["summary"]["tracked_nights"] == 0


def test_sleep_insights_uses_saved_target_when_query_override_is_absent() -> None:
    client, user = authenticate_pro_user()
    user.sleep_target_minutes = 480
    user.save(update_fields=["sleep_target_minutes"])

    response = client.get("/api/v1/metrics/analytics/sleep/")

    assert response.status_code == 200
    assert response.json()["target_minutes"] == 480


def test_sleep_insights_query_target_is_a_non_persisting_preview() -> None:
    client, user = authenticate_pro_user()

    response = client.get("/api/v1/metrics/analytics/sleep/?target_minutes=480")

    assert response.status_code == 200
    assert response.json()["target_minutes"] == 480
    user.refresh_from_db()
    assert user.sleep_target_minutes == 450
