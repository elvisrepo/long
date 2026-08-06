from datetime import UTC, datetime, timedelta

import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from apps.metrics.models import MetricDefinition, MetricEntry
from apps.wearables.models import WearableConnection

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

def test_metric_entry_list_can_filter_by_metric_slug():
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
              "metric_definition": "mood",
              "value": 8,
              "recorded_at": "2026-03-06T07:15:00Z",
          },
          format="json",
      )

      response = client.get("/api/v1/metrics/entries/?metric=resting_hr")

      assert response.status_code == 200

      data = response.json()
      assert [entry["metric_definition"] for entry in data] == ["resting_hr"]
      assert [entry["value"] for entry in data] == [58.0]


def test_metric_entry_list_can_filter_by_recorded_at_from():
    client, _user = authenticate_client_for("alice@example.com")


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
    
    response = client.get(
          "/api/v1/metrics/entries/?from=2026-03-06T00:00:00Z"
      )
    
    assert response.status_code == 200

    data = response.json()
    assert [entry["value"] for entry in data] == [61.0]


def test_metric_entry_list_can_filter_by_recorded_at_to():
      client, _user = authenticate_client_for("alice@example.com")

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

      response = client.get(
          "/api/v1/metrics/entries/?to=2026-03-05T23:59:59Z"
      )

      assert response.status_code == 200

      data = response.json()
      assert [entry["value"] for entry in data] == [58.0]

def test_authenticated_user_can_limit_metric_entries_list():
    client, _user = authenticate_client_for("alice@example.com")

    resting_hr = MetricDefinition.objects.get(slug="resting_hr")

    for value in [55, 56, 57]:
          MetricEntry.objects.create(
              user=_user,
              metric_definition=resting_hr,
              value=value,
              recorded_at=f"2026-03-0{value - 54}T07:15:00Z",
          )

    response = client.get("/api/v1/metrics/entries/?limit=2")

    assert response.status_code == 200
    assert len(response.json()) == 2
    assert [entry["value"] for entry in response.json()] == [57.0, 56.0]

@pytest.mark.parametrize("limit", ["0", "-1", "abc"])
def test_metric_entry_list_rejects_invalid_limit(limit: str):
      client, _user = authenticate_client_for("alice@example.com")

      response = client.get(f"/api/v1/metrics/entries/?limit={limit}")

      assert response.status_code == 400
      assert response.json() == {
          "limit": ["Limit must be a positive integer."]
      }

def test_metric_entry_list_applies_default_limit():
      client, user = authenticate_client_for("alice@example.com")
      resting_hr = MetricDefinition.objects.get(slug="resting_hr")
      start = datetime(2026, 3, 1, 7, 15, tzinfo=UTC)

      for index in range(55):
          MetricEntry.objects.create(
              user=user,
              metric_definition=resting_hr,
              value=80 + index,
              recorded_at=start + timedelta(days=index),
          )

      response = client.get("/api/v1/metrics/entries/")

      assert response.status_code == 200
      assert len(response.json()) == 50

def test_user_can_update_their_own_metric_entry():
    client, user = authenticate_client_for("alice@example.com")
    resting_hr = MetricDefinition.objects.get(slug="resting_hr")
        
    entry = MetricEntry.objects.create(
          user=user,
          metric_definition=resting_hr,
          value=58,
          recorded_at="2026-03-05T07:15:00Z",
          context={"notes": "before walk"},
      )
    
    response = client.patch(
          f"/api/v1/metrics/entries/{entry.id}/",
          {
              "value": 62,
              "recorded_at": "2026-03-06T08:30:00Z",
              "context": {"notes": "after walk"},
          },
          format="json",
      )
    
    assert response.status_code == 200

    data = response.json()
    assert data["id"] == entry.id
    assert data["metric_definition"] == "resting_hr"
    assert data["value"] == 62
    assert data["recorded_at"] == "2026-03-06T08:30:00Z"
    assert data["context"] == {"notes": "after walk"}

    entry.refresh_from_db()
    assert entry.value == 62
    assert entry.recorded_at.isoformat().replace("+00:00", "Z") == (
          "2026-03-06T08:30:00Z"
      )
    assert entry.context == {"notes": "after walk"} 


def test_user_cannot_update_wearable_synced_metric_entry():
    client, user = authenticate_client_for("alice@example.com")
    connection = WearableConnection.objects.create(
        user=user,
        provider=WearableConnection.Provider.HEALTH_CONNECT,
    )
    entry = MetricEntry.objects.create(
        user=user,
        metric_definition=MetricDefinition.objects.get(slug="body_weight"),
        value=78.4,
        recorded_at="2026-08-05T08:00:00Z",
        source=MetricEntry.Source.SAMSUNG_HEALTH,
        source_connection=connection,
        external_source_id="health_connect:WeightRecord:immutable-update",
    )

    response = client.patch(
        f"/api/v1/metrics/entries/{entry.id}/",
        {"value": 80.0},
        format="json",
    )

    assert response.status_code == 409
    assert response.json() == {
        "detail": "Synced metric entries cannot be edited or deleted."
    }
    entry.refresh_from_db()
    assert entry.value == 78.4

def test_user_cannot_update_another_users_metric_entry():
      alice_client, _alice = authenticate_client_for("alice@example.com")
      bob = get_user_model().objects.create_user(
          email="bob@example.com",
          password="strong-password-123",
      )
      resting_hr = MetricDefinition.objects.get(slug="resting_hr")
      entry = MetricEntry.objects.create(
          user=bob,
          metric_definition=resting_hr,
          value=58,
          recorded_at="2026-03-05T07:15:00Z",
          context={"notes": "bob entry"},
      )

      response = alice_client.patch(
          f"/api/v1/metrics/entries/{entry.id}/",
          {
              "value": 62,
              "context": {"notes": "alice tried to edit"},
          },
          format="json",
      )

      assert response.status_code == 404

      entry.refresh_from_db()
      assert entry.value == 58
      assert entry.context == {"notes": "bob entry"}


def test_user_can_delete_their_own_metric_entry():
      client, user = authenticate_client_for("alice@example.com")
      resting_hr = MetricDefinition.objects.get(slug="resting_hr")
      entry = MetricEntry.objects.create(
          user=user,
          metric_definition=resting_hr,
          value=58,
          recorded_at="2026-03-05T07:15:00Z",
          context={"notes": "delete me"},
      )

      response = client.delete(f"/api/v1/metrics/entries/{entry.id}/")

      assert response.status_code == 204
      assert not MetricEntry.objects.filter(id=entry.id).exists()


def test_user_cannot_delete_wearable_synced_metric_entry():
      client, user = authenticate_client_for("alice@example.com")
      connection = WearableConnection.objects.create(
          user=user,
          provider=WearableConnection.Provider.HEALTH_CONNECT,
      )
      entry = MetricEntry.objects.create(
          user=user,
          metric_definition=MetricDefinition.objects.get(slug="body_weight"),
          value=78.4,
          recorded_at="2026-08-05T08:00:00Z",
          source=MetricEntry.Source.SAMSUNG_HEALTH,
          source_connection=connection,
          external_source_id="health_connect:WeightRecord:immutable-delete",
      )

      response = client.delete(f"/api/v1/metrics/entries/{entry.id}/")

      assert response.status_code == 409
      assert response.json() == {
          "detail": "Synced metric entries cannot be edited or deleted."
      }
      assert MetricEntry.objects.filter(id=entry.id).exists()

def test_user_cannot_delete_another_users_metric_entry():
      alice_client, _alice = authenticate_client_for("alice@example.com")
      bob = get_user_model().objects.create_user(
          email="bob@example.com",
          password="strong-password-123",
      )
      resting_hr = MetricDefinition.objects.get(slug="resting_hr")
      entry = MetricEntry.objects.create(
          user=bob,
          metric_definition=resting_hr,
          value=58,
          recorded_at="2026-03-05T07:15:00Z",
          context={"notes": "bob entry"},
      )

      response = alice_client.delete(f"/api/v1/metrics/entries/{entry.id}/")

      assert response.status_code == 404
      assert MetricEntry.objects.filter(id=entry.id).exists()


def test_metric_entry_update_value_must_be_within_metric_definition_range():
      client, user = authenticate_client_for("alice@example.com")
      resting_hr = MetricDefinition.objects.get(slug="resting_hr")
      entry = MetricEntry.objects.create(
          user=user,
          metric_definition=resting_hr,
          value=58,
          recorded_at="2026-03-05T07:15:00Z",
      )

      response = client.patch(
          f"/api/v1/metrics/entries/{entry.id}/",
          {
              "value": 500,
          },
          format="json",
      )

      assert response.status_code == 400
      assert response.json() == {
          "value": ["Value must be between 20.0 and 220.0."]
      }

      entry.refresh_from_db()
      assert entry.value == 58

def test_entries_for_inactive_custom_metric_remain_readable_by_metric_filter():
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

        create_response = client.post(
            "/api/v1/metrics/entries/",
            {
                "metric_definition": "mood",
                "value": 8,
                "recorded_at": "2026-03-05T07:15:00Z",
            },
            format="json",
        )

        assert create_response.status_code == 201

        deactivate_response = client.patch(
            f"/api/v1/metrics/definitions/{definition.id}/",
            {
                "is_active": False,
            },
            format="json",
        )

        assert deactivate_response.status_code == 200

        response = client.get("/api/v1/metrics/entries/?metric=mood")

        assert response.status_code == 200

        data = response.json()
        assert len(data) == 1
        assert data[0]["metric_definition"] == "mood"
        assert data[0]["value"] == 8.0

def test_entries_for_inactive_custom_metric_remain_readable():
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
      MetricEntry.objects.create(
          user=user,
          metric_definition=definition,
          value=8,
          recorded_at="2026-03-05T07:15:00Z",
          context={"notes": "before deactivation"},
      )

      definition.is_active = False
      definition.save(update_fields=["is_active"])

      response = client.get("/api/v1/metrics/entries/?metric=mood")

      assert response.status_code == 200

      payload = response.json()
      assert len(payload) == 1
      assert payload[0]["metric_definition"] == "mood"
      assert payload[0]["value"] == 8.0
      assert payload[0]["context"] == {"notes": "before deactivation"}

def test_user_cannot_create_metric_entry_for_deactivated_custom_metric():
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
          "metric_definition": ["Object with slug=mood does not exist."]
      }

def test_deactivated_custom_metric_definition_is_hidden_after_patch():
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

      deactivate_response = client.patch(
          f"/api/v1/metrics/definitions/{definition.id}/",
          {
              "is_active": False,
          },
          format="json",
      )

      assert deactivate_response.status_code == 200

      list_response = client.get("/api/v1/metrics/definitions/")

      assert list_response.status_code == 200

      slugs = [definition["slug"] for definition in list_response.json()]
      assert "resting_hr" in slugs
      assert "mood" not in slugs
