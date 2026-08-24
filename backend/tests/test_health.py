from unittest.mock import patch

import pytest
from django.db import OperationalError, connection
from django.test import Client
from django.urls import reverse


def test_liveness_endpoint_returns_ok(client: Client) -> None:
    response = client.get(reverse("health-live"))

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_liveness_endpoint_does_not_query_database(client: Client) -> None:
    with patch.object(connection, "cursor") as cursor:
        response = client.get(reverse("health-live"))

    assert response.status_code == 200
    cursor.assert_not_called()


@pytest.mark.django_db
def test_readiness_endpoint_returns_ok_when_database_is_available(
    client: Client,
) -> None:
    response = client.get(reverse("health-ready"))

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_readiness_endpoint_returns_redacted_503_when_database_is_unavailable(
    client: Client,
) -> None:
    database_error = OperationalError("password=must-not-leak")

    with patch.object(connection, "cursor", side_effect=database_error):
        response = client.get(reverse("health-ready"))

    assert response.status_code == 503
    assert response.json() == {"status": "unavailable"}
    assert "must-not-leak" not in response.content.decode()


def test_legacy_health_endpoint_is_removed(client: Client) -> None:
    response = client.get("/health/")

    assert response.status_code == 404


@pytest.mark.parametrize("route_name", ("health-live", "health-ready"))
def test_health_endpoints_reject_non_get_requests(
    client: Client,
    route_name: str,
) -> None:
    with patch.object(connection, "cursor") as cursor:
        response = client.post(reverse(route_name))

    assert response.status_code == 405
    cursor.assert_not_called()
