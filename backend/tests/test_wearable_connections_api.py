import pytest
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from apps.users.models import User
from apps.wearables.models import WearableConnection

pytestmark = pytest.mark.django_db

def authenticate_client_for(email: str) -> tuple[APIClient, User]:
      user = User.objects.create_user(
          email=email,
          password="strong-password-123",
      )
      client = APIClient()
      access_token = RefreshToken.for_user(user).access_token
      client.credentials(HTTP_AUTHORIZATION=f"Bearer {access_token}")
      return client, user


def test_wearable_connections_list_requires_authentication():
    response = APIClient().get("/api/v1/wearables/connections/")

    assert response.status_code == 401

def test_wearable_connections_list_is_scoped_to_authenticated_user():
      client, user = authenticate_client_for("owner@example.com")
      other_user = User.objects.create_user(
          email="other@example.com",
          password="strong-password-123",
      )

      own_connection = WearableConnection.objects.create(
          user=user,
          provider=WearableConnection.Provider.HEALTH_CONNECT,
          status=WearableConnection.Status.CONNECTED,
      )
      WearableConnection.objects.create(
          user=other_user,
          provider=WearableConnection.Provider.SAMSUNG_HEALTH,
          status=WearableConnection.Status.CONNECTED,
      )

      response = client.get("/api/v1/wearables/connections/")

      assert response.status_code == 200

      connections = response.json()
      assert len(connections) == 1
      assert connections[0]["id"] == str(own_connection.id)
      assert connections[0]["provider"] == "health_connect"
      assert connections[0]["status"] == "connected"
      assert connections[0]["last_synced_at"] is None
      assert connections[0]["last_error"] == ""