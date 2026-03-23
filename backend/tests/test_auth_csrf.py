import pytest
from rest_framework.test import APIClient


pytestmark = pytest.mark.django_db


def test_csrf_endpoint_sets_csrf_cookie():
      client = APIClient(enforce_csrf_checks=True)

      response = client.get("/api/auth/csrf/")

      assert response.status_code == 200
      assert "csrftoken" in response.cookies