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
def test_e2e_reset_endpoint_flushes_database_and_restores_seed_data():
    from common.testing_views import reset_e2e_database_view
    from apps.metrics.models import MetricDefinition
    from apps.subscriptions.models import SubscriptionPlan, SubscriptionPrice

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
    # The reset endpoint uses flush, which also deletes seed rows; restore the
    # baseline metrics so browser tests see the same app state after each reset.
    assert MetricDefinition.objects.filter(
        user=None,
        slug="resting_hr",
        is_active=True,
    ).exists()
    # Registration requires an explicit current subscription, so E2E reset
    # must also restore the shared plan assigned during registration.
    assert SubscriptionPlan.objects.filter(
        code="free",
        is_default=True,
        is_active=True,
    ).exists()
    # Settings subscription E2E needs one paid plan and active prices, but
    # Checkout itself is mocked so default browser tests never call Stripe.
    pro_plan = SubscriptionPlan.objects.get(
        code="pro",
        is_default=False,
        is_active=True,
    )
    assert SubscriptionPrice.objects.filter(
        plan=pro_plan,
        provider=SubscriptionPrice.Provider.STRIPE,
        provider_price_id="price_e2e_pro_monthly",
        unit_amount=1000,
        billing_interval=SubscriptionPrice.BillingInterval.MONTH,
        is_active=True,
    ).exists()
    assert SubscriptionPrice.objects.filter(
        plan=pro_plan,
        provider=SubscriptionPrice.Provider.STRIPE,
        provider_price_id="price_e2e_pro_yearly",
        unit_amount=10000,
        billing_interval=SubscriptionPrice.BillingInterval.YEAR,
        is_active=True,
    ).exists()


def test_e2e_reset_endpoint_is_disabled_outside_e2e_runtime():
    from common.testing_views import reset_e2e_database_view

    request = APIRequestFactory().post("/api/testing/reset/")

    with override_settings(ENABLE_E2E_TESTING_API=False):
        response = reset_e2e_database_view(request)

    assert response.status_code == 404
