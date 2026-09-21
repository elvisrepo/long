import csv
import io
import json

import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from apps.metrics.models import MetricDefinition, MetricEntry
from apps.subscriptions.models import Subscription, SubscriptionPlan


pytestmark = pytest.mark.django_db


def authenticate_client_for(
    email: str,
    *,
    csv_export_enabled: bool = True,
) -> tuple[APIClient, object]:
    client = APIClient()
    user = get_user_model().objects.create_user(
        email=email,
        password="strong-password-123",
    )
    plan = SubscriptionPlan.objects.get(code="free")
    if csv_export_enabled:
        plan = SubscriptionPlan.objects.create(
            code=f"export-{user.pk}",
            name="Export",
            active_custom_metric_limit=10,
            wearable_connection_limit=1,
            sync_interval_minutes=15,
            csv_export_enabled=True,
        )
    Subscription.objects.create(
        user=user,
        plan=plan,
        status=Subscription.Status.ACTIVE,
    )
    refresh = RefreshToken.for_user(user)
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {refresh.access_token}")
    return client, user


def read_csv_response(response: object) -> list[dict[str, str]]:
    content = b"".join(response.streaming_content).decode("utf-8")
    return list(csv.DictReader(io.StringIO(content)))


def test_free_user_cannot_export_metric_entries():
    client, _user = authenticate_client_for(
        "free@example.com",
        csv_export_enabled=False,
    )

    response = client.get("/api/v1/metrics/entries/export/")

    assert response.status_code == 403
    assert response.json() == {"detail": "Pro CSV export is required."}


def test_csv_export_requires_authentication():
    response = APIClient().get("/api/v1/metrics/entries/export/")

    assert response.status_code == 401


def test_authenticated_user_can_export_their_metric_entries_as_csv():
    client, user = authenticate_client_for("alice@example.com")
    weight = MetricDefinition.objects.get(slug="body_weight")
    MetricEntry.objects.create(
        user=user,
        metric_definition=weight,
        value=84.2,
        recorded_at="2026-09-20T07:15:00Z",
        source=MetricEntry.Source.SAMSUNG_HEALTH,
    )

    response = client.get("/api/v1/metrics/entries/export/")

    assert response.status_code == 200
    assert response["Content-Type"] == "text/csv; charset=utf-8"
    assert response["Content-Disposition"] == (
        'attachment; filename="longevity-metrics.csv"'
    )
    assert read_csv_response(response) == [
        {
            "entry_id": str(MetricEntry.objects.get().id),
            "metric_slug": "body_weight",
            "metric_name": "Body Weight",
            "value": "84.2",
            "unit": "kg",
            "period_start": "",
            "recorded_at": "2026-09-20T07:15:00Z",
            "source": "samsung_health",
            "context": "{}",
            "created_at": MetricEntry.objects.get()
            .created_at.isoformat()
            .replace("+00:00", "Z"),
        }
    ]


def test_csv_export_preserves_sleep_window_and_context():
    client, user = authenticate_client_for("alice@example.com")
    sleep = MetricDefinition.objects.get(slug="sleep_duration")
    entry = MetricEntry.objects.create(
        user=user,
        metric_definition=sleep,
        value=7.5,
        period_start="2026-09-19T23:00:00Z",
        recorded_at="2026-09-20T06:30:00Z",
        context={"notes": "Woke once"},
    )

    response = client.get("/api/v1/metrics/entries/export/")

    assert response.status_code == 200
    assert read_csv_response(response) == [
        {
            "entry_id": str(entry.id),
            "metric_slug": "sleep_duration",
            "metric_name": "Sleep Duration",
            "value": "7.5",
            "unit": "hours",
            "period_start": "2026-09-19T23:00:00Z",
            "recorded_at": "2026-09-20T06:30:00Z",
            "source": "manual",
            "context": json.dumps({"notes": "Woke once"}),
            "created_at": entry.created_at.isoformat().replace("+00:00", "Z"),
        }
    ]


def test_csv_export_excludes_other_users_entries():
    client, alice = authenticate_client_for("alice@example.com")
    _other_client, bob = authenticate_client_for("bob@example.com")
    weight = MetricDefinition.objects.get(slug="body_weight")
    MetricEntry.objects.create(
        user=alice,
        metric_definition=weight,
        value=84.2,
        recorded_at="2026-09-20T07:15:00Z",
    )
    MetricEntry.objects.create(
        user=bob,
        metric_definition=weight,
        value=72.1,
        recorded_at="2026-09-20T08:15:00Z",
    )

    response = client.get("/api/v1/metrics/entries/export/")

    assert response.status_code == 200
    assert [row["value"] for row in read_csv_response(response)] == ["84.2"]


def test_csv_export_applies_metric_and_recorded_at_filters():
    client, user = authenticate_client_for("alice@example.com")
    weight = MetricDefinition.objects.get(slug="body_weight")
    steps = MetricDefinition.objects.get(slug="steps")
    MetricEntry.objects.create(
        user=user,
        metric_definition=weight,
        value=84.5,
        recorded_at="2026-09-18T07:15:00Z",
    )
    MetricEntry.objects.create(
        user=user,
        metric_definition=weight,
        value=84.2,
        recorded_at="2026-09-20T07:15:00Z",
    )
    MetricEntry.objects.create(
        user=user,
        metric_definition=steps,
        value=9000,
        recorded_at="2026-09-20T20:00:00Z",
    )

    response = client.get(
        "/api/v1/metrics/entries/export/"
        "?metric=body_weight"
        "&from=2026-09-19T00:00:00Z"
        "&to=2026-09-20T23:59:59Z"
    )

    assert response.status_code == 200
    assert [row["value"] for row in read_csv_response(response)] == ["84.2"]


def test_csv_export_rejects_invalid_recorded_at_filter():
    client, _user = authenticate_client_for("alice@example.com")

    response = client.get("/api/v1/metrics/entries/export/?from=not-a-date")

    assert response.status_code == 400
    assert response.json() == {"from": ["Enter a valid date/time."]}


def test_csv_export_escapes_spreadsheet_formula_cells():
    client, user = authenticate_client_for("alice@example.com")
    custom_metric = MetricDefinition.objects.create(
        user=user,
        name="=SUM(A1:A2)",
        slug="custom-score",
        unit="@unit",
        category=MetricDefinition.Category.CUSTOM,
        min_value=0,
        max_value=100,
    )
    MetricEntry.objects.create(
        user=user,
        metric_definition=custom_metric,
        value=10,
        recorded_at="2026-09-20T07:15:00Z",
    )

    response = client.get("/api/v1/metrics/entries/export/")

    assert response.status_code == 200
    [row] = read_csv_response(response)
    assert row["metric_name"] == "'=SUM(A1:A2)"
    assert row["unit"] == "'@unit"
