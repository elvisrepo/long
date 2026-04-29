import importlib

import pytest
from django.contrib.auth import get_user_model
from django.test import override_settings
from rest_framework.test import APIRequestFactory

"""
testing the environment/configuration that the running E2E backend will use

“Runtime” here means: the actual running configuration/environment the app uses when it starts. For E2E,
  that includes:

  - Django settings module: config.settings.e2e
  - Database target: db-e2e/longevity_e2e
  - Test-only flag: ENABLE_E2E_TESTING_API=True
  - Test-only reset endpoint behavior
  - CSRF trusted frontend origin
"""

def test_e2e_settings_use_dedicated_database_and_enable_testing_api():
    e2e_settings = importlib.import_module("config.settings.e2e")

    # This is the safety boundary that keeps Playwright away from dev data.
    assert e2e_settings.ENABLE_E2E_TESTING_API is True
    assert e2e_settings.DATABASES["default"]["NAME"] == "longevity_e2e"
    assert e2e_settings.DATABASES["default"]["HOST"] == "db-e2e"
    assert "http://127.0.0.1:5173" in e2e_settings.CSRF_TRUSTED_ORIGINS


@pytest.mark.django_db(transaction=True)
def test_e2e_reset_endpoint_flushes_database():
    from common.testing_views import reset_e2e_database_view

    User = get_user_model()
    User.objects.create_user(
        email="e2e-user@example.com",
        password="strong-password-123",
    )

    request = APIRequestFactory().post("/api/testing/reset/")

    with override_settings(ENABLE_E2E_TESTING_API=True):
        response = reset_e2e_database_view(request)

    assert response.status_code == 204
    assert User.objects.count() == 0


def test_e2e_reset_endpoint_is_disabled_outside_e2e_runtime():
    from common.testing_views import reset_e2e_database_view

    request = APIRequestFactory().post("/api/testing/reset/")

    with override_settings(ENABLE_E2E_TESTING_API=False):
        response = reset_e2e_database_view(request)

    assert response.status_code == 404
