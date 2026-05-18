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

    refresh = RefreshToken.for_user(user)
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {refresh.access_token}")
    return client, user


def test_authenticated_user_can_create_metric_entry_for_default_metric():
    client, _user = authenticate_client_for("alice@example.com")

    response = client.post(
        "/api/v1/metrics/entries/",
        {
            # Public API uses the metric slug, not the database UUID.
            "metric_definition": "resting_hr",
            "value": 58,
            "recorded_at": "2026-03-05T07:15:00Z",
            "context": {"notes": "morning measurement"},
        },
        format="json",
    )

    assert response.status_code == 201

    data = response.json()
    assert data["id"]
    assert data["metric_definition"] == "resting_hr"
    assert data["value"] == 58
    assert data["recorded_at"] == "2026-03-05T07:15:00Z"
    assert data["source"] == "manual"
    assert data["context"] == {"notes": "morning measurement"}
    assert data["created_at"]

def test_metric_entry_value_must_be_within_metric_definition_range():
    client, _user = authenticate_client_for("alice@example.com")

    response = client.post(
          "/api/v1/metrics/entries/",
          {
              "metric_definition": "resting_hr",
              "value": 500,
              "recorded_at": "2026-03-05T07:15:00Z",
          },
          format="json",
      )
    
    assert response.status_code == 400
    assert response.json() == {
          "value": ["Value must be between 20.0 and 220.0."]
      }


def test_user_cannot_create_metric_entry_for_another_users_custom_metric():
    client, _alice = authenticate_client_for("alice@example.com")
    bob = get_user_model().objects.create_user(
          email="bob@example.com",
          password="strong-password-123",
      )
    
    MetricDefinition.objects.create(
          user=bob,
          name="Mood",
          slug="mood",
          unit="score",
          category=MetricDefinition.Category.CUSTOM,
          min_value=1,
          max_value=10,
          is_default=False,
      )
    
    response = client.post(
          "/api/v1/metrics/entries/",
          {
              "metric_definition": "mood",
              "value": 8,
              "recorded_at": "2026-03-05T07:15:00Z",
          },
          format="json",
      )
    
    assert response.status_code == 400
    assert response.json() == {
          "metric_definition": ['Object with slug=mood does not exist.']
      }
    
def test_user_cannot_create_metric_entry_for_inactive_metric_definition():
    client, _user = authenticate_client_for("alice@example.com")

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
    
    response = client.post(
          "/api/v1/metrics/entries/",
          {
              "metric_definition": "inactive_metric",
              "value": 8,
              "recorded_at": "2026-03-05T07:15:00Z",
          },
          format="json",
      )

    assert response.status_code == 400
    assert response.json() == {
          "metric_definition": [
              "Object with slug=inactive_metric does not exist."
          ]
      }
    
def test_metric_entry_create_requires_authentication():
      client = APIClient()

      response = client.post(
          "/api/v1/metrics/entries/",
          {
              "metric_definition": "resting_hr",
              "value": 58,
              "recorded_at": "2026-03-05T07:15:00Z",
          },
          format="json",
      )

      assert response.status_code == 401

def test_user_can_create_metric_entry_for_their_own_custom_metric():
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
          "/api/v1/metrics/entries/",
          {
              "metric_definition": "mood",
              "value": 8,
              "recorded_at": "2026-03-05T07:15:00Z",
          },
          format="json",
      )
    
    assert response.status_code == 201

    data = response.json()
    assert data["metric_definition"] == "mood"
    assert data["value"] == 8
    assert data["source"] == "manual"

def test_user_can_list_their_metric_entries_newest_first():
      client, user = authenticate_client_for("alice@example.com")

      client.post(
          "/api/v1/metrics/entries/",
          {
              "metric_definition": "resting_hr",
              "value": 58,
              "recorded_at": "2026-03-05T07:15:00Z",
          },
          format="json",
      )
      client.post(
          "/api/v1/metrics/entries/",
          {
              "metric_definition": "resting_hr",
              "value": 61,
              "recorded_at": "2026-03-06T07:15:00Z",
          },
          format="json",
      )

      response = client.get("/api/v1/metrics/entries/")

      assert response.status_code == 200

      data = response.json()
      assert [entry["value"] for entry in data] == [61.0, 58.0]
      assert [entry["metric_definition"] for entry in data] == [
          "resting_hr",
          "resting_hr",
      ]

def test_metric_entry_list_only_returns_current_users_entries():
      alice_client, _alice = authenticate_client_for("alice@example.com")
      bob_client, _bob = authenticate_client_for("bob@example.com")

      alice_client.post(
          "/api/v1/metrics/entries/",
          {
              "metric_definition": "resting_hr",
              "value": 58,
              "recorded_at": "2026-03-05T07:15:00Z",
          },
          format="json",
      )
      bob_client.post(
          "/api/v1/metrics/entries/",
          {
              "metric_definition": "resting_hr",
              "value": 72,
              "recorded_at": "2026-03-06T07:15:00Z",
          },
          format="json",
      )

      response = alice_client.get("/api/v1/metrics/entries/")

      assert response.status_code == 200

      data = response.json()
      assert [entry["value"] for entry in data] == [58.0]