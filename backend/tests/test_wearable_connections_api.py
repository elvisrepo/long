import pytest
from rest_framework.test import APIClient

pytestmark = pytest.mark.django_db

def test_wearable_connections_list_requires_authentication():
    response = APIClient().get("/api/v1/wearables/connections/")

    assert response.status_code == 401