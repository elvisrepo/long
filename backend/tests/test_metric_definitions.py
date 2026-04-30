import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from apps.metrics.models import MetricDefinition


pytestmark = pytest.mark.django_db


def authenticate_client_for(email: str) -> tuple[APIClient, object]:
    client = APIClient()
    user = get_user_model().objects.create_user(
        email=email,
        password="strong-password-123",
    )
    # Build a real JWT so this test exercises DRF/SimpleJWT auth, not force_authenticate.
    refresh = RefreshToken.for_user(user)
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {refresh.access_token}")
    return client, user


def test_metric_definitions_requires_authentication():
    client = APIClient()

    response = client.get("/api/v1/metrics/definitions/")

    assert response.status_code == 401


def test_metric_definitions_lists_defaults_and_user_owned_custom_metrics():
    client, user = authenticate_client_for("alice@example.com")
    other_user = get_user_model().objects.create_user(
        email="bob@example.com",
        password="strong-password-123",
    )

    # User-owned custom metrics should be returned alongside system defaults.
    MetricDefinition.objects.create(
        user=user,
        name="Mood",
        slug="mood",
        unit="score",
        category=MetricDefinition.Category.CUSTOM,
        min_value=1,
        max_value=10,
        is_default=False,
    )
    # Another user's custom metrics must not leak across tenant boundaries.
    MetricDefinition.objects.create(
        user=other_user,
        name="Other User Metric",
        slug="other_user_metric",
        unit="score",
        category=MetricDefinition.Category.CUSTOM,
        min_value=1,
        max_value=10,
        is_default=False,
    )
    # Inactive definitions should stay hidden even when they are system defaults.
    MetricDefinition.objects.create(
        name="Inactive Metric",
        slug="inactive_metric",
        unit="score",
        category=MetricDefinition.Category.CUSTOM,
        min_value=1,
        max_value=10,
        is_default=True,
        is_active=False,
    )

    response = client.get("/api/v1/metrics/definitions/")

    assert response.status_code == 200

    definitions = response.json()
    slugs = [definition["slug"] for definition in definitions]

    assert "resting_hr" in slugs
    assert "vo2_max" in slugs
    assert "mood" in slugs
    assert "other_user_metric" not in slugs
    assert "inactive_metric" not in slugs

    resting_hr = next(
        definition for definition in definitions if definition["slug"] == "resting_hr"
    )
    assert resting_hr == {
        "id": resting_hr["id"],
        "name": "Resting Heart Rate",
        "slug": "resting_hr",
        "unit": "bpm",
        "category": "cardiovascular",
        "min_value": 20.0,
        "max_value": 220.0,
        "is_default": True,
    }
