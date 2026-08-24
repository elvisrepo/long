"""Contracts for the runtime configuration used by browser-driven E2E tests.

The runtime includes the dedicated Django settings module and database, the
test-only reset API, trusted frontend origins, and outbound-provider safety
boundaries.
"""

import importlib
from pathlib import Path

import pytest
from django.contrib.auth import get_user_model
from django.test import override_settings
from rest_framework.test import APIRequestFactory


BACKEND_DIR = Path(__file__).resolve().parents[1]


def test_e2e_settings_use_dedicated_database_and_enable_testing_api():
    e2e_settings = importlib.import_module("config.settings.e2e")

    # This is the safety boundary that keeps Playwright away from dev data.
    assert e2e_settings.ENABLE_E2E_TESTING_API is True
    assert e2e_settings.DATABASES["default"]["NAME"] == "longevity_e2e"
    assert e2e_settings.DATABASES["default"]["HOST"] == "db-e2e"
    assert "http://127.0.0.1:5173" in e2e_settings.CSRF_TRUSTED_ORIGINS


def test_e2e_settings_replace_inherited_stripe_configuration() -> None:
    e2e_settings = importlib.import_module("config.settings.e2e")

    expected_values = {
        "STRIPE_SECRET_KEY": "e2e-stripe-api-disabled",
        "STRIPE_WEBHOOK_SECRET": "e2e-webhook-disabled",
        "STRIPE_CHECKOUT_SUCCESS_URL": (
            "http://127.0.0.1:5173/settings?checkout=success"
        ),
        "STRIPE_CHECKOUT_CANCEL_URL": (
            "http://127.0.0.1:5173/settings?checkout=cancelled"
        ),
        "STRIPE_CUSTOMER_PORTAL_RETURN_URL": (
            "http://127.0.0.1:5173/settings"
        ),
    }
    mismatched_names = [
        name
        for name, expected_value in expected_values.items()
        if getattr(e2e_settings, name) != expected_value
    ]

    # Report names only: an inherited developer credential must never be
    # rendered into pytest output when this safety contract fails.
    assert not mismatched_names, (
        f"Unsafe E2E Stripe settings: {mismatched_names}"
    )


def test_e2e_settings_disable_outbound_stripe_api_calls() -> None:
    e2e_settings = importlib.import_module("config.settings.e2e")

    assert e2e_settings.STRIPE_OUTBOUND_API_ENABLED is False


def test_e2e_compose_process_receives_only_inert_stripe_values() -> None:
    compose = (BACKEND_DIR / "docker-compose.yml").read_text()
    web_e2e_service = compose.split("    web-e2e:", maxsplit=1)[1].split(
        "    celery:", maxsplit=1
    )[0]

    expected_environment = (
        "STRIPE_SECRET_KEY: e2e-stripe-api-disabled",
        "STRIPE_WEBHOOK_SECRET: e2e-webhook-disabled",
        "STRIPE_CHECKOUT_SUCCESS_URL: "
        "http://127.0.0.1:5173/settings?checkout=success",
        "STRIPE_CHECKOUT_CANCEL_URL: "
        "http://127.0.0.1:5173/settings?checkout=cancelled",
        "STRIPE_CUSTOMER_PORTAL_RETURN_URL: "
        "http://127.0.0.1:5173/settings",
    )

    assert all(
        expected_value in web_e2e_service
        for expected_value in expected_environment
    )


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
