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


ACTIVE_CUSTOM_METRIC_LIMIT = 3


def create_custom_metric_definition(
    user: object,
    slug: str,
    *,
    is_active: bool = True,
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
        "is_active": True,
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
          "is_active": True,
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


def test_user_cannot_create_custom_metric_above_active_limit():
    client, user = authenticate_client_for("alice@example.com")

    for index in range(ACTIVE_CUSTOM_METRIC_LIMIT):
        create_custom_metric_definition(user, f"custom_metric_{index}")

    response = client.post(
        "/api/v1/metrics/definitions/",
        {
            "name": "Limit Exceeded",
            "slug": "limit_exceeded",
            "unit": "score",
            "category": "custom",
            "min_value": 1,
            "max_value": 10,
        },
        format="json",
    )

    assert response.status_code == 400
    assert response.json() == {
        "non_field_errors": ["Active custom metric limit reached."]
    }


def test_inactive_custom_metrics_do_not_count_toward_active_limit():
    client, user = authenticate_client_for("alice@example.com")

    for index in range(ACTIVE_CUSTOM_METRIC_LIMIT - 1):
        create_custom_metric_definition(user, f"active_metric_{index}")
    create_custom_metric_definition(user, "archived_metric", is_active=False)

    response = client.post(
        "/api/v1/metrics/definitions/",
        {
            "name": "Allowed Metric",
            "slug": "allowed_metric",
            "unit": "score",
            "category": "custom",
            "min_value": 1,
            "max_value": 10,
        },
        format="json",
    )

    assert response.status_code == 201

    definition = MetricDefinition.objects.get(user=user, slug="allowed_metric")
    assert definition.is_active is True


def test_user_can_update_active_custom_metric_metadata_at_active_limit():
    client, user = authenticate_client_for("alice@example.com")

    definitions = [
        create_custom_metric_definition(user, f"active_metric_{index}")
        for index in range(ACTIVE_CUSTOM_METRIC_LIMIT)
    ]
    definition = definitions[0]

    response = client.patch(
        f"/api/v1/metrics/definitions/{definition.id}/",
        {
            "name": "Updated Metric",
            "unit": "points",
            "min_value": 0,
            "max_value": 100,
        },
        format="json",
    )

    assert response.status_code == 200

    definition.refresh_from_db()
    assert definition.name == "Updated Metric"
    assert definition.unit == "points"
    assert definition.min_value == 0
    assert definition.max_value == 100
    assert definition.is_active is True


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
          "is_active": True,
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

def test_user_cannot_update_custom_metric_definition_slug():
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
              "slug": "daily_mood",
          },
          format="json",
      )

      assert response.status_code == 200

      payload = response.json()
      assert payload["slug"] == "mood"

      definition.refresh_from_db()
      assert definition.slug == "mood"

def test_custom_metric_definition_update_rejects_invalid_value_range():
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
              "min_value": 20,
          },
          format="json",
      )

      assert response.status_code == 400
      assert "max_value" in response.json()

      definition.refresh_from_db()
      assert definition.min_value == 1
      assert definition.max_value == 10

def test_custom_metric_definition_update_requires_authentication():
      user = get_user_model().objects.create_user(
          email="alice@example.com",
          password="strong-password-123",
      )
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

      response = APIClient().patch(
          f"/api/v1/metrics/definitions/{definition.id}/",
          {
              "name": "Mood Score",
          },
          format="json",
      )

      assert response.status_code == 401

      definition.refresh_from_db()
      assert definition.name == "Mood"

def test_user_can_deactivate_their_own_custom_metric_definition():
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
                "is_active": False,
            },
            format="json",
        )

        assert response.status_code == 200

        definition.refresh_from_db()
        assert definition.is_active is False

def test_user_can_reactivate_their_own_custom_metric_definition():
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
            is_active=False,
        )

        response = client.patch(
            f"/api/v1/metrics/definitions/{definition.id}/",
            {
                "is_active": True,
            },
            format="json",
        )

        assert response.status_code == 200

        definition.refresh_from_db()
        assert definition.is_active is True

def test_user_cannot_deactivate_another_users_custom_metric_definition():
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
                "is_active": False,
            },
            format="json",
        )

        assert response.status_code == 404

        definition.refresh_from_db()
        assert definition.is_active is True

def test_user_cannot_deactivate_default_metric_definition():
        client, _user = authenticate_client_for("alice@example.com")
        definition = MetricDefinition.objects.get(slug="resting_hr")

        response = client.patch(
            f"/api/v1/metrics/definitions/{definition.id}/",
            {
                "is_active": False,
            },
            format="json",
        )

        assert response.status_code == 404

        definition.refresh_from_db()
        assert definition.is_active is True


def test_inactive_custom_metric_definition_is_hidden_from_active_list():
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
            is_active=False,
        )

        response = client.get("/api/v1/metrics/definitions/")

        assert response.status_code == 200

        slugs = [definition["slug"] for definition in response.json()]
        assert "resting_hr" in slugs
        assert "mood" not in slugs


def test_metric_definition_list_can_include_current_users_inactive_custom_metrics():
        client, user = authenticate_client_for("alice@example.com")
        other_user = get_user_model().objects.create_user(
            email="bob@example.com",
            password="strong-password-123",
        )

        MetricDefinition.objects.create(
            user=user,
            name="Mood",
            slug="mood",
            unit="score",
            category=MetricDefinition.Category.CUSTOM,
            min_value=1,
            max_value=10,
            is_default=False,
            is_active=False,
        )
        MetricDefinition.objects.create(
            user=other_user,
            name="Other Mood",
            slug="other_mood",
            unit="score",
            category=MetricDefinition.Category.CUSTOM,
            min_value=1,
            max_value=10,
            is_default=False,
            is_active=False,
        )
        MetricDefinition.objects.create(
            name="Inactive Default",
            slug="inactive_default",
            unit="score",
            category=MetricDefinition.Category.CUSTOM,
            min_value=1,
            max_value=10,
            is_default=True,
            is_active=False,
        )

        response = client.get(
            "/api/v1/metrics/definitions/?include_inactive=true"
        )

        assert response.status_code == 200

        definitions = response.json()
        definitions_by_slug = {
            definition["slug"]: definition for definition in definitions
        }

        assert "resting_hr" in definitions_by_slug
        assert definitions_by_slug["resting_hr"]["is_active"] is True
        assert "mood" in definitions_by_slug
        assert definitions_by_slug["mood"]["is_active"] is False
        assert "other_mood" not in definitions_by_slug
        assert "inactive_default" not in definitions_by_slug

def test_user_cannot_reactivate_custom_metric_above_active_limit():
      client, user = authenticate_client_for("alice@example.com")

      for index in range(ACTIVE_CUSTOM_METRIC_LIMIT):
          create_custom_metric_definition(user, f"active_metric_{index}")

      archived_metric = create_custom_metric_definition(
          user,
          "archived_metric",
          is_active=False,
      )

      response = client.patch(
          f"/api/v1/metrics/definitions/{archived_metric.id}/",
          {
              "is_active": True,
          },
          format="json",
      )

      assert response.status_code == 400
      assert response.json() == {
          "non_field_errors": ["Active custom metric limit reached."]
      }

      archived_metric.refresh_from_db()
      assert archived_metric.is_active is False
