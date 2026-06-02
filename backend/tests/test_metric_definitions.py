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


def test_authenticated_user_can_create_custom_metric_definition():
    client, user = authenticate_client_for("alice@example.com")

    response = client.post(
          "/api/v1/metrics/definitions/",
          {
              "name": "Mood",
              "slug": "mood",
              "unit": "score",
              "category": "custom",
              "min_value": 1,
              "max_value": 10,
          },
          format="json",
      )
    
    assert response.status_code == 201

    payload = response.json()
    assert payload == {
          "id": payload["id"],
          "name": "Mood",
          "slug": "mood",
          "unit": "score",
          "category": "custom",
          "min_value": 1.0,
          "max_value": 10.0,
          "is_default": False,
    }

    definition = MetricDefinition.objects.get(user=user, slug="mood")
    assert definition.name == "Mood"
    assert definition.unit == "score"
    assert definition.category == MetricDefinition.Category.CUSTOM
    assert definition.min_value == 1
    assert definition.max_value == 10
    assert definition.is_default is False
    assert definition.is_active is True


def test_user_cannot_create_duplicate_custom_metric_slug():
    client, user = authenticate_client_for("alice@example.com")

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

    response = client.post(
          "/api/v1/metrics/definitions/",
          {
              "name": "Mood Copy",
              "slug": "mood",
              "unit": "score",
              "category": "custom",
              "min_value": 1,
              "max_value": 10,
          },
          format="json",
      )

    assert response.status_code == 400
    assert "slug" in response.json()


def test_user_cannot_create_custom_metric_with_default_metric_slug():
      client, _user = authenticate_client_for("alice@example.com")

      response = client.post(
          "/api/v1/metrics/definitions/",
          {
              "name": "My Resting Heart Rate",
              "slug": "resting_hr",
              "unit": "bpm",
              "category": "custom",
              "min_value": 20,
              "max_value": 220,
          },
          format="json",
      )

      print(response.status_code, response.json())
      assert response.status_code == 400
      assert "slug" in response.json()


def test_user_cannot_create_custom_metric_with_invalid_value_range():
      client, _user = authenticate_client_for("alice@example.com")

      response = client.post(
          "/api/v1/metrics/definitions/",
          {
              "name": "Stress",
              "slug": "stress",
              "unit": "score",
              "category": "custom",
              "min_value": 10,
              "max_value": 1,
          },
          format="json",
      )

      assert response.status_code == 400
      assert "max_value" in response.json()


def test_custom_metric_definition_create_requires_authentication():
      client = APIClient()

      response = client.post(
          "/api/v1/metrics/definitions/",
          {
              "name": "Mood",
              "slug": "mood",
              "unit": "score",
              "category": "custom",
              "min_value": 1,
              "max_value": 10,
          },
          format="json",
      )

      assert response.status_code == 401


def test_user_can_update_their_own_custom_metric_definition():
      client, user = authenticate_client_for("alice@example.com")

      definition = MetricDefinition.objects.create(
          user=user,
          name="Mood",
          slug="mood",
          unit="score",
          category=MetricDefinition.Category.CUSTOM,
          min_value=1,
          max_value=10,
          is_default=False,
      )

      response = client.patch(
          f"/api/v1/metrics/definitions/{definition.id}/",
          {
              "name": "Mood Score",
              "unit": "points",
              "min_value": 0,
              "max_value": 100,
          },
          format="json",
      )

      assert response.status_code == 200

      payload = response.json()
      assert payload == {
          "id": str(definition.id),
          "name": "Mood Score",
          "slug": "mood",
          "unit": "points",
          "category": "custom",
          "min_value": 0.0,
          "max_value": 100.0,
          "is_default": False,
      }

      definition.refresh_from_db()
      assert definition.name == "Mood Score"
      assert definition.slug == "mood"
      assert definition.unit == "points"
      assert definition.min_value == 0
      assert definition.max_value == 100

def test_user_cannot_update_another_users_custom_metric_definition():
      client, _user = authenticate_client_for("alice@example.com")
      other_user = get_user_model().objects.create_user(
          email="bob@example.com",
          password="strong-password-123",
      )
      definition = MetricDefinition.objects.create(
          user=other_user,
          name="Mood",
          slug="mood",
          unit="score",
          category=MetricDefinition.Category.CUSTOM,
          min_value=1,
          max_value=10,
          is_default=False,
      )

      response = client.patch(
          f"/api/v1/metrics/definitions/{definition.id}/",
          {
              "name": "Hijacked Mood",
          },
          format="json",
      )

      assert response.status_code == 404

      definition.refresh_from_db()
      assert definition.name == "Mood"

def test_user_cannot_update_default_metric_definition():
      client, _user = authenticate_client_for("alice@example.com")
      definition = MetricDefinition.objects.get(slug="resting_hr")

      response = client.patch(
          f"/api/v1/metrics/definitions/{definition.id}/",
          {
              "name": "My Resting HR",
          },
          format="json",
      )

      assert response.status_code == 404

      definition.refresh_from_db()
      assert definition.name == "Resting Heart Rate"