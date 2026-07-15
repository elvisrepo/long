import pytest
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from apps.subscriptions.models import Subscription, SubscriptionPlan
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
        provider=WearableConnection.Provider.HEALTH_CONNECT,
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


def test_wearable_connection_creation_assigns_authenticated_user():
    client, user = authenticate_client_for("pro-owner@example.com")
    pro_plan = SubscriptionPlan.objects.create(
        code="pro",
        name="Pro",
        active_custom_metric_limit=10,
        wearable_connection_limit=1,
        sync_interval_minutes=15,
    )
    Subscription.objects.create(
        user=user,
        plan=pro_plan,
        status=Subscription.Status.ACTIVE,
    )

    response = client.post(
        "/api/v1/wearables/connections/",
        {"provider": "health_connect"},
        format="json",
    )

    assert response.status_code == 201

    connection = WearableConnection.objects.get()
    assert connection.user == user
    assert connection.provider == WearableConnection.Provider.HEALTH_CONNECT
    assert connection.status == WearableConnection.Status.DISCONNECTED


def test_wearable_connection_creation_rejects_samsung_health_as_provider():
    client, user = authenticate_client_for("invalid-provider@example.com")
    pro_plan = SubscriptionPlan.objects.create(
        code="pro-invalid-provider",
        name="Pro",
        active_custom_metric_limit=10,
        wearable_connection_limit=1,
        sync_interval_minutes=15,
    )
    Subscription.objects.create(
        user=user,
        plan=pro_plan,
        status=Subscription.Status.ACTIVE,
    )

    response = client.post(
        "/api/v1/wearables/connections/",
        {"provider": "samsung_health"},
        format="json",
    )

    assert response.status_code == 400
    assert "provider" in response.json()
    assert WearableConnection.objects.filter(user=user).exists() is False


def test_wearable_connection_creation_rejects_reached_plan_limit():
    client, user = authenticate_client_for("zero-limit@example.com")
    limited_plan = SubscriptionPlan.objects.create(
        code="zero-wearable-limit",
        name="Zero Wearable Limit",
        active_custom_metric_limit=10,
        wearable_connection_limit=0,
        sync_interval_minutes=15,
    )
    Subscription.objects.create(
        user=user,
        plan=limited_plan,
        status=Subscription.Status.ACTIVE,
    )
    response = client.post(
        "/api/v1/wearables/connections/",
        {"provider": "health_connect"},
        format="json",
    )

    assert response.status_code == 400
    assert response.json() == {
        "non_field_errors": ["Wearable connection limit reached."]
    }
    assert WearableConnection.objects.filter(user=user).exists() is False


def test_free_plan_cannot_create_wearable_connection():
    client, user = authenticate_client_for("free-wearable@example.com")
    free_plan = SubscriptionPlan.objects.get(code="free")
    Subscription.objects.create(
        user=user,
        plan=free_plan,
        status=Subscription.Status.ACTIVE,
    )

    response = client.post(
        "/api/v1/wearables/connections/",
        {"provider": "health_connect"},
        format="json",
    )

    assert response.status_code == 400
    assert response.json() == {
        "non_field_errors": ["Wearable connection limit reached."]
    }
    assert WearableConnection.objects.filter(user=user).exists() is False


def test_wearable_connection_creation_rejects_duplicate_provider():
    client, user = authenticate_client_for("duplicate-provider@example.com")
    multi_connection_plan = SubscriptionPlan.objects.create(
        code="multi-connection-test",
        name="Multi Connection Test",
        active_custom_metric_limit=10,
        wearable_connection_limit=2,
        sync_interval_minutes=15,
    )
    Subscription.objects.create(
        user=user,
        plan=multi_connection_plan,
        status=Subscription.Status.ACTIVE,
    )
    WearableConnection.objects.create(
        user=user,
        provider=WearableConnection.Provider.HEALTH_CONNECT,
        status=WearableConnection.Status.CONNECTED,
    )

    response = client.post(
        "/api/v1/wearables/connections/",
        {"provider": "health_connect"},
        format="json",
    )

    assert response.status_code == 400
    assert response.json() == {
        "provider": ["This provider is already registered."]
    }
    assert WearableConnection.objects.filter(user=user).count() == 1


def test_wearable_connection_creation_rejects_client_supplied_status():
    client, user = authenticate_client_for("client-status@example.com")

    pro_plan = SubscriptionPlan.objects.create(
        code="pro-client-status",
        name="Pro",
        active_custom_metric_limit=10,
        wearable_connection_limit=1,
        sync_interval_minutes=15,
    )
    Subscription.objects.create(
        user=user,
        plan=pro_plan,
        status=Subscription.Status.ACTIVE,
    )

    response = client.post(
        "/api/v1/wearables/connections/",
        {
            "provider": "health_connect",
            "status": "connected",
        },
        format="json",
    )

    assert response.status_code == 400
    assert response.json() == {
        "status": ["This field is server-managed."]
    }
    assert WearableConnection.objects.filter(user=user).exists() is False


def test_wearable_connection_delete_removes_owned_connection():
    client, user = authenticate_client_for("disconnect-owner@example.com")
    connection = WearableConnection.objects.create(
        user=user,
        provider=WearableConnection.Provider.HEALTH_CONNECT,
        status=WearableConnection.Status.CONNECTED,
    )

    response = client.delete(
        f"/api/v1/wearables/connections/{connection.id}/"
    )

    assert response.status_code == 204
    assert WearableConnection.objects.filter(id=connection.id).exists() is False


def test_wearable_connection_delete_requires_authentication():
    user = User.objects.create_user(
        email="disconnect-auth@example.com",
        password="strong-password-123",
    )
    connection = WearableConnection.objects.create(
        user=user,
        provider=WearableConnection.Provider.HEALTH_CONNECT,
    )

    response = APIClient().delete(
        f"/api/v1/wearables/connections/{connection.id}/"
    )

    assert response.status_code == 401
    assert WearableConnection.objects.filter(id=connection.id).exists() is True


def test_wearable_connection_delete_cannot_remove_another_users_connection():
    client, _ = authenticate_client_for("disconnect-attacker@example.com")
    owner = User.objects.create_user(
        email="disconnect-target@example.com",
        password="strong-password-123",
    )
    connection = WearableConnection.objects.create(
        user=owner,
        provider=WearableConnection.Provider.HEALTH_CONNECT,
    )

    response = client.delete(
        f"/api/v1/wearables/connections/{connection.id}/"
    )

    assert response.status_code == 404
    assert WearableConnection.objects.filter(id=connection.id).exists() is True


def test_wearable_connection_delete_is_safe_to_repeat():
    client, user = authenticate_client_for("disconnect-repeat@example.com")
    connection = WearableConnection.objects.create(
        user=user,
        provider=WearableConnection.Provider.HEALTH_CONNECT,
    )
    url = f"/api/v1/wearables/connections/{connection.id}/"

    first_response = client.delete(url)
    repeated_response = client.delete(url)

    assert first_response.status_code == 204
    assert repeated_response.status_code == 404
    assert WearableConnection.objects.filter(id=connection.id).exists() is False


def test_wearable_connection_delete_releases_the_plan_slot():
    client, user = authenticate_client_for("disconnect-slot@example.com")
    pro_plan = SubscriptionPlan.objects.create(
        code="pro-disconnect-slot",
        name="Pro",
        active_custom_metric_limit=10,
        wearable_connection_limit=1,
        sync_interval_minutes=15,
    )
    Subscription.objects.create(
        user=user,
        plan=pro_plan,
        status=Subscription.Status.ACTIVE,
    )
    connection = WearableConnection.objects.create(
        user=user,
        provider=WearableConnection.Provider.HEALTH_CONNECT,
    )

    delete_response = client.delete(
        f"/api/v1/wearables/connections/{connection.id}/"
    )
    create_response = client.post(
        "/api/v1/wearables/connections/",
        {"provider": "health_connect"},
        format="json",
    )

    assert delete_response.status_code == 204
    assert create_response.status_code == 201
    assert create_response.json()["id"] != str(connection.id)
    assert WearableConnection.objects.filter(user=user).count() == 1


def test_wearable_connection_status_returns_owned_connection_state():
    client, user = authenticate_client_for("status-owner@example.com")
    connection = WearableConnection.objects.create(
        user=user,
        provider=WearableConnection.Provider.HEALTH_CONNECT,
        status=WearableConnection.Status.ERROR,
        last_error="Health Connect permission was revoked.",
    )

    response = client.get(
        f"/api/v1/wearables/connections/{connection.id}/status/"
    )

    assert response.status_code == 200
    assert response.json() == {
        "id": str(connection.id),
        "provider": "health_connect",
        "status": "error",
        "last_synced_at": None,
        "last_error": "Health Connect permission was revoked.",
    }


def test_wearable_connection_status_requires_authentication():
    user = User.objects.create_user(
        email="status-auth@example.com",
        password="strong-password-123",
    )
    connection = WearableConnection.objects.create(
        user=user,
        provider=WearableConnection.Provider.HEALTH_CONNECT,
    )

    response = APIClient().get(
        f"/api/v1/wearables/connections/{connection.id}/status/"
    )

    assert response.status_code == 401


def test_wearable_connection_status_hides_another_users_connection():
    client, _ = authenticate_client_for("status-attacker@example.com")
    owner = User.objects.create_user(
        email="status-target@example.com",
        password="strong-password-123",
    )
    connection = WearableConnection.objects.create(
        user=owner,
        provider=WearableConnection.Provider.HEALTH_CONNECT,
        status=WearableConnection.Status.CONNECTED,
    )

    response = client.get(
        f"/api/v1/wearables/connections/{connection.id}/status/"
    )

    assert response.status_code == 404
