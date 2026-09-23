from django.test import Client


def test_ping_task_endpoint_is_not_public(client: Client) -> None:
    response = client.get("/tasks/ping/")

    assert response.status_code == 404
