import pytest
from django.contrib.auth import get_user_model

from apps.wearables.models import WearableConnection

pytestmark = pytest.mark.django_db

def test_wearable_connection_stores_owner_provider_status_and_sync_state():
    user = get_user_model().objects.create_user(
          email="wearable-owner@example.com",
          password="strong-password-123",
    )

    connection = WearableConnection.objects.create(
          user=user,
          provider=WearableConnection.Provider.HEALTH_CONNECT,
          status=WearableConnection.Status.CONNECTED,
      )
    
    assert connection.user == user
    assert connection.provider == "health_connect"
    assert connection.status == "connected"
    assert connection.last_synced_at is None
    assert connection.last_error == ""
    assert connection.created_at is not None
    assert connection.updated_at is not None