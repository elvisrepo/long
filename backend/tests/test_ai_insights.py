from datetime import UTC, datetime
from zoneinfo import ZoneInfo

import pytest

from apps.metrics.ai_insights import build_weekly_snapshot
from apps.metrics.models import MetricDefinition, MetricEntry
from apps.users.models import User
from rest_framework.test import APIClient
from apps.subscriptions.models import Subscription, SubscriptionPlan
from django.core.cache import caches
from django.test import override_settings
from unittest.mock import patch, MagicMock
import json

pytestmark = pytest.mark.django_db
URL = "/api/v1/metrics/analytics/ai-weekly/"


def test_detailed_tracker_input_includes_food_names_counts_and_owner_only_history() -> (
    None
):
    from apps.diet.models import DietEntry, DietFood, DietSection

    user = User.objects.create_user(email="detailed@example.com", password="test")
    other = User.objects.create_user(
        email="other-detailed@example.com", password="test"
    )
    section = DietSection.objects.create(user=user, name="Vegetables")
    food = DietFood.objects.create(section=section, name="Broccoli")
    for day in ["2026-10-09", "2026-10-15", "2026-10-16"]:
        DietEntry.objects.create(user=user, food=food, performed_on=day)
    other_food = DietFood.objects.create(
        section=DietSection.objects.create(user=other, name="Private"),
        name="Other account food",
    )
    DietEntry.objects.create(user=other, food=other_food, performed_on="2026-10-16")
    snapshot = build_weekly_snapshot(
        user=user, zone=ZoneInfo("UTC"), now=datetime(2026, 10, 17, 12, tzinfo=UTC)
    )
    diet = snapshot["evidence"]["diet"]
    assert diet["details"][0]["name"] == "Broccoli"
    assert diet["details"][0]["group"] == "Vegetables"
    assert diet["details"][0]["current_logged_days"] == 2
    assert diet["details"][0]["previous_logged_days"] == 1
    assert diet["coverage"]["configured_items"] == 1
    assert diet["coverage"]["last_logged_on"] == "2026-10-16"
    assert "Other account food" not in str(snapshot)


@override_settings(NVIDIA_INSIGHTS_MODEL="nvidia/nemotron-3-super-120b-a12b")
def test_nemotron_review_reserves_output_for_the_report() -> None:
    from apps.metrics.ai_insights import generate_weekly_review

    review = {
        "observations": [{"text": "One recorded day.", "evidence_keys": ["steps"]}],
        "suggestion": "Keep logging.",
    }
    response = MagicMock()
    response.__enter__.return_value.read.return_value = json.dumps(
        {"choices": [{"message": {"content": json.dumps(review)}}]}
    ).encode()
    with patch("apps.metrics.ai_insights.urlopen", return_value=response) as provider:
        assert (
            generate_weekly_review(
                {"evidence": {"steps": {"current": {"observed_days": 1}}}},
                api_key="nvapi-test-personal",
            )
            == review
        )
    body = json.loads(provider.call_args.args[0].data)
    assert body["chat_template_kwargs"] == {"enable_thinking": False}
    assert body["temperature"] == 1.0


@pytest.mark.parametrize("status", [502, 503, 504])
def test_provider_gateway_failure_is_actionable_and_does_not_leak_body(
    status: int,
) -> None:
    from urllib.error import HTTPError
    from apps.metrics.ai_insights import generate_weekly_review, WeeklyReviewFailed
    from io import BytesIO

    failure = HTTPError(
        "https://integrate.api.nvidia.com/v1/chat/completions",
        status,
        "Gateway error",
        {},
        BytesIO(b"private provider response"),
    )
    with patch("apps.metrics.ai_insights.urlopen", side_effect=failure):
        with pytest.raises(WeeklyReviewFailed) as caught:
            generate_weekly_review({"evidence": {}}, api_key="nvapi-test-personal")
    assert "model service is temporarily unavailable" in str(caught.value.detail)
    assert "private provider response" not in str(caught.value.detail)


@pytest.fixture(autouse=True)
def clear_rate_limits():
    cache = caches["ai_insights"]
    cache.clear()
    yield
    cache.clear()


def pro_client() -> tuple[APIClient, User]:
    user = User.objects.create_user(email="weekly-pro@example.com", password="test")
    plan = SubscriptionPlan.objects.create(
        code="weekly-pro",
        name="Pro",
        analytics_enabled=True,
        active_custom_metric_limit=10,
        wearable_connection_limit=2,
        sync_interval_minutes=15,
    )
    Subscription.objects.create(user=user, plan=plan, status="active")
    client = APIClient()
    client.force_authenticate(user)
    return client, user


def test_preview_is_local_and_generation_requires_consent_and_configuration() -> None:
    client, _ = pro_client()
    assert APIClient().get(URL).status_code == 401
    response = client.get(URL, {"timezone": "Europe/Tirane"})
    assert response.status_code == 200
    assert response.data["available"] is False
    assert response["Cache-Control"] == "private, no-store"
    assert "evidence" in response.data["snapshot"]
    assert client.post(URL, {"timezone": "UTC"}, format="json").status_code == 400
    assert (
        client.post(
            URL, {"timezone": "UTC", "consent": True}, format="json"
        ).status_code
        == 503
    )
    assert client.get(URL, {"timezone": "bad"}).status_code == 400


@override_settings(NVIDIA_API_KEY="test-only-not-a-real-key")
@pytest.mark.parametrize("personal_key", [None, "nvapi-personal-precedence"])
def test_generate_from_owned_data_with_evidence_and_safe_errors(
    personal_key: str | None,
) -> None:
    from django.utils import timezone
    from datetime import timedelta

    client, user = pro_client()
    if personal_key:
        assert (
            client.put(
                "/api/v1/metrics/analytics/ai-key/",
                {"api_key": personal_key},
                format="json",
            ).status_code
            == 200
        )
    MetricEntry.objects.create(
        user=user,
        metric_definition=MetricDefinition.objects.get(user=None, slug="hrv"),
        value=44,
        recorded_at=timezone.now() - timedelta(days=1),
    )
    review = suggestions_review()
    response_body = {"choices": [{"message": {"content": json.dumps(review)}}]}
    response = MagicMock()
    response.__enter__.return_value.read.return_value = json.dumps(
        response_body
    ).encode()
    with patch("apps.metrics.ai_insights.urlopen", return_value=response) as provider:
        result = client.post(URL, {"timezone": "UTC", "consent": True}, format="json")
        assert result.status_code == 202, result.data
        job_id = result.data["job_id"]
        result = client.get(URL, {"job_id": job_id})
        assert result.data["status"] == "ready", result.data
        assert result.data["result"]["review"] == review
        assert result.data["result"]["model"] == "deepseek-ai/deepseek-v4.1-flash"
        request = provider.call_args.args[0]
        assert (
            request.get_header("Authorization")
            == f"Bearer {personal_key or 'test-only-not-a-real-key'}"
        )
        sent = json.loads(request.data)
        assert sent["max_tokens"] == 8000
        assert "weekly-pro@example.com" not in request.data.decode()
        assert (
            json.loads(sent["messages"][1]["content"])["evidence"]["hrv"]["current"][
                "daily_average"
            ]
            == 44
        )
        assert (
            client.post(
                URL, {"timezone": "UTC", "consent": True}, format="json"
            ).status_code
            == 202
        )
        assert provider.call_count == 2
    caches["ai_insights"].clear()
    with patch(
        "apps.metrics.ai_insights.urlopen",
        side_effect=TimeoutError("private provider payload"),
    ):
        result = client.post(URL, {"timezone": "UTC", "consent": True}, format="json")
        assert result.status_code == 202
        result = client.get(URL, {"job_id": result.data["job_id"]})
        assert result.data["status"] == "failed"
        assert "private provider payload" not in str(result.data)


def test_free_plan_and_unknown_fields_cannot_generate() -> None:
    client, user = pro_client()
    response = client.post(
        URL,
        {"timezone": "UTC", "consent": True, "user_id": "someone-else"},
        format="json",
    )
    assert response.status_code == 400
    SubscriptionPlan.objects.filter(code="weekly-pro").update(analytics_enabled=False)
    assert client.get(URL).status_code == 403
    assert (
        client.post(
            URL, {"timezone": "UTC", "consent": True}, format="json"
        ).status_code
        == 403
    )


def test_personal_api_key_is_encrypted_write_only_and_removable() -> None:
    client, user = pro_client()
    key_url = "/api/v1/metrics/analytics/ai-key/"
    assert (
        APIClient().put(key_url, {"api_key": "nvapi-test-personal"}).status_code == 401
    )
    response = client.put(key_url, {"api_key": "nvapi-test-personal"}, format="json")
    assert response.status_code == 200
    assert response.data == {"has_personal_key": True}
    user.refresh_from_db()
    assert (
        user.ai_api_key_encrypted
        and "nvapi-test-personal" not in user.ai_api_key_encrypted
    )
    assert client.get(key_url).data == {"has_personal_key": True}
    from apps.users.account import account_export

    exported = "".join(account_export(user))
    assert "nvapi-test-personal" not in exported
    assert "ai_api_key_encrypted" not in exported
    assert (
        client.put(
            key_url, {"api_key": "https://wrong-provider.example"}, format="json"
        ).status_code
        == 400
    )
    other = User.objects.create_user(email="other-key@example.com", password="test")
    other_client = APIClient()
    other_client.force_authenticate(other)
    assert other_client.get(key_url).data == {"has_personal_key": False}
    assert client.delete(key_url).status_code == 200
    user.refresh_from_db()
    assert user.ai_api_key_encrypted == ""


def test_job_results_are_encrypted_and_scoped_to_the_requesting_user() -> None:
    from apps.metrics.tasks import review_job_key
    from apps.users.models import encrypt_value
    import uuid

    client, user = pro_client()
    job_id = str(uuid.uuid4())
    cache = caches["ai_insights"]
    cache.set(
        review_job_key(str(user.pk), job_id),
        encrypt_value(
            json.dumps({"status": "ready", "result": {"private": "owner-only"}})
        ),
    )
    assert "owner-only" not in cache.get(review_job_key(str(user.pk), job_id))
    assert client.get(URL, {"job_id": job_id}).data["result"]["private"] == "owner-only"
    other = User.objects.create_user(email="other-job@example.com", password="test")
    Subscription.objects.create(
        user=other,
        plan=SubscriptionPlan.objects.get(code="weekly-pro"),
        status="active",
    )
    client.force_authenticate(other)
    assert client.get(URL, {"job_id": job_id}).data["status"] == "expired"
    assert client.get(URL, {"job_id": "invalid"}).status_code == 400


@override_settings(NVIDIA_API_KEY="test-only-not-a-real-key")
def test_empty_data_never_calls_provider() -> None:
    client, _ = pro_client()
    with patch("apps.metrics.ai_insights.urlopen") as provider:
        result = client.post(URL, {"timezone": "UTC", "consent": True}, format="json")
    assert result.status_code == 400
    provider.assert_not_called()


@pytest.mark.parametrize("keys", [["made_up"], ["steps"], [], "hrv"])
def test_model_must_reference_existing_nonempty_evidence(keys: object) -> None:
    from apps.metrics.ai_insights import validate_review

    snapshot = {
        "evidence": {
            "hrv": {"current": {"observed_days": 1}},
            "steps": {"current": {"observed_days": 0}},
        }
    }
    with pytest.raises(ValueError):
        validate_review(
            {
                "observations": [{"text": "A claim", "evidence_keys": keys}],
                "suggestion": "Keep logging.",
            },
            snapshot,
        )


@override_settings(NVIDIA_API_KEY="test-only-not-a-real-key")
def test_existing_quota_and_cooldown_do_not_block_repeated_model_requests() -> None:
    from django.utils import timezone
    from datetime import timedelta

    client, user = pro_client()
    MetricEntry.objects.create(
        user=user,
        metric_definition=MetricDefinition.objects.get(user=None, slug="hrv"),
        value=44,
        recorded_at=timezone.now() - timedelta(days=1),
    )
    cache = caches["ai_insights"]
    quota_key = f"ai-weekly-quota:{user.pk}:{timezone.now().date()}"
    cache.set(quota_key, 999)
    cache.set(f"ai-weekly-lock:{user.pk}", True, timeout=90)
    with patch(
        "apps.metrics.ai_insights_views.generate_weekly_review_task.delay"
    ) as provider:
        for model in [
            "deepseek-ai/deepseek-v4.1-flash",
            "nvidia/nemotron-3.5-super-vl-120b-a12b",
            "deepseek-ai/deepseek-v4.1-flash",
        ]:
            result = client.post(
                URL, {"timezone": "UTC", "consent": True, "model": model}, format="json"
            )
            assert result.status_code == 202, result.data
        assert provider.call_count == 3
    assert cache.get(quota_key) == 999


def test_snapshot_uses_real_owned_completed_local_days() -> None:
    user = User.objects.create_user(email="insights@example.com", password="test")
    other = User.objects.create_user(
        email="other-insights@example.com", password="test"
    )
    definition = MetricDefinition.objects.get(user=None, slug="hrv")
    for owner, value, stamp in [
        (user, 40, "2026-10-09T10:00:00Z"),
        (user, 50, "2026-10-16T10:00:00Z"),
        (other, 200, "2026-10-16T10:00:00Z"),
        (user, 250, "2026-10-16T23:00:00Z"),
    ]:
        MetricEntry.objects.create(
            user=owner, metric_definition=definition, value=value, recorded_at=stamp
        )
    snapshot = build_weekly_snapshot(
        user=user,
        zone=ZoneInfo("Europe/Tirane"),
        now=datetime(2026, 10, 17, 12, tzinfo=UTC),
    )
    hrv = snapshot["evidence"]["hrv"]
    assert snapshot["period"] == {"from": "2026-10-10", "to": "2026-10-16"}
    assert hrv["current"] == {"observed_days": 1, "daily_average": 50.0}
    assert hrv["previous"] == {"observed_days": 1, "daily_average": 40.0}
    assert hrv["change"] == 10.0
    assert hrv["series"][0] == {"date": "2026-10-03", "value": None}
    assert hrv["series"][-1] == {"date": "2026-10-16", "value": 50.0}
    assert "insights@example.com" not in str(snapshot)


def test_snapshot_reuses_priority_totals_and_real_tracker_logs() -> None:
    from apps.diet.models import DietEntry, DietFood, DietSection
    from apps.workouts.models import Workout

    user = User.objects.create_user(email="trackers@example.com", password="test")
    definition = MetricDefinition.objects.get(user=None, slug="total_calories_burned")
    for value, context, stamp in [
        (
            100,
            {"aggregation": "health_connect", "has_data": True},
            "2026-10-16T23:45:00Z",
        ),
        (
            20,
            {"aggregation": "health_connect", "has_data": True},
            "2026-10-17T00:00:00Z",
        ),
        (9000, {}, "2026-10-16T23:00:00Z"),
        (
            0,
            {"aggregation": "health_connect", "has_data": False},
            "2026-10-15T12:00:00Z",
        ),
    ]:
        MetricEntry.objects.create(
            user=user,
            metric_definition=definition,
            value=value,
            recorded_at=stamp,
            source="health_connect",
            context=context,
        )
    section = DietSection.objects.create(user=user, name="Private section")
    food = DietFood.objects.create(section=section, name="Private food")
    DietEntry.objects.create(user=user, food=food, performed_on="2026-10-16")
    Workout.objects.create(
        user=user, performed_on="2026-10-16", is_finished=True, notes="Private note"
    )
    Workout.objects.create(user=user, performed_on="2026-10-16", is_finished=False)
    snapshot = build_weekly_snapshot(
        user=user, zone=ZoneInfo("UTC"), now=datetime(2026, 10, 17, 12, tzinfo=UTC)
    )
    assert (
        snapshot["evidence"]["total_calories_burned"]["current"]["daily_average"] == 120
    )
    assert snapshot["evidence"]["diet"]["current"] == {"count": 1, "logged_days": 1}
    assert snapshot["evidence"]["workouts"]["current"]["count"] == 1
    assert "Private food" in str(snapshot)
    assert "Private note" not in str(snapshot)


def test_completed_sets_in_open_sessions_include_quantities_and_keep_units_separate() -> (
    None
):
    from apps.workouts.models import (
        Exercise,
        ExerciseCategory,
        Workout,
        WorkoutExercise,
        WorkoutSet,
    )

    user = User.objects.create_user(email="sets-summary@example.com", password="test")
    category = ExerciseCategory.objects.create(user=user, name="Strength")
    exercise = Exercise.objects.create(
        category=category, name="Squat", tracking_type="strength"
    )
    workout = Workout.objects.create(
        user=user, performed_on="2026-10-16", notes="Never send this"
    )
    for unit, weight in [("kg", 50), ("lb", 100)]:
        instance = WorkoutExercise.objects.create(
            workout=workout,
            exercise=exercise,
            exercise_name="Squat",
            category_name="Strength",
            tracking_type="strength",
            weight_unit=unit,
            distance_unit="km",
        )
        WorkoutSet.objects.create(
            workout_exercise=instance,
            is_completed=True,
            weight=weight,
            reps=5,
            comment="Private set comment",
        )
        WorkoutSet.objects.create(
            workout_exercise=instance, is_completed=False, weight=999, reps=10
        )
    snapshot = build_weekly_snapshot(
        user=user, zone=ZoneInfo("UTC"), now=datetime(2026, 10, 17, 12, tzinfo=UTC)
    )
    evidence = snapshot["evidence"]
    assert evidence["workouts"]["current"]["count"] == 0
    assert evidence["workouts"]["sessions"]["current"]["unfinished"] == 1
    assert evidence["workout_sets"]["current"]["count"] == 2
    details = evidence["workout_sets"]["details"]
    assert {(row["weight_unit"], row["current"]["load_volume"]) for row in details} == {
        ("kg", 250),
        ("lb", 500),
    }
    assert all(row["current"]["reps"] == 5 for row in details)
    assert "Never send this" not in str(snapshot)
    assert "Private set comment" not in str(snapshot)


def suggestions_review() -> dict:
    return {
        "suggestions": [
            {
                "text": "Try your usual routine consistently and compare next week.",
                "evidence_keys": ["hrv"],
            }
        ]
    }


def comprehensive_review() -> dict:
    return {
        "overview": "A review of this week's actual records.",
        "sections": [
            {
                "key": key,
                "text": "Coverage limits what can be concluded.",
                "evidence_keys": [evidence],
            }
            for key, evidence in [
                ("health", "hrv"),
                ("activity", "steps"),
                ("workouts", "workout_sets"),
                ("diet", "diet"),
                ("recovery", "recovery"),
                ("stretching", "stretching"),
            ]
        ],
        "connections": [],
        "priorities": [
            {
                "text": "Review the recorded routine on your next planning day.",
                "evidence_keys": ["hrv"],
            }
        ],
    }


def test_comprehensive_review_requires_every_tracker_and_allows_honest_empty_sections() -> (
    None
):
    from apps.metrics.ai_insights import validate_review

    snapshot = {
        "prompt_version": "weekly-v2",
        "evidence": {
            key: {"current": {"observed_days": 0}}
            for key in [
                "hrv",
                "steps",
                "workout_sets",
                "diet",
                "recovery",
                "stretching",
            ]
        },
    }
    report = comprehensive_review()
    assert validate_review(report, snapshot) == report
    report["sections"].pop()
    with pytest.raises(ValueError):
        validate_review(report, snapshot)


def test_metric_ranges_and_within_week_change_use_observed_dates_only() -> None:
    user = User.objects.create_user(email="trend@example.com", password="test")
    metric = MetricDefinition.objects.get(user=None, slug="hrv")
    for day, value in [("2026-10-10", 40), ("2026-10-12", 55), ("2026-10-16", 45)]:
        MetricEntry.objects.create(
            user=user,
            metric_definition=metric,
            value=value,
            recorded_at=f"{day}T12:00:00Z",
        )
    row = build_weekly_snapshot(
        user=user, zone=ZoneInfo("UTC"), now=datetime(2026, 10, 17, 12, tzinfo=UTC)
    )["evidence"]["hrv"]
    assert row["trend"] == {
        "minimum": 40,
        "maximum": 55,
        "minimum_dates": ["2026-10-10"],
        "maximum_dates": ["2026-10-12"],
        "first": 40,
        "last": 45,
        "first_date": "2026-10-10",
        "last_date": "2026-10-16",
        "within_week_change": 5,
    }


@pytest.mark.parametrize(
    "case",
    [
        "duplicate_section",
        "foreign_domain",
        "invented_key",
        "empty_connection",
        "duplicate_connection_key",
        "oversized_text",
    ],
)
def test_comprehensive_report_rejects_unsupported_or_malformed_claims(
    case: str,
) -> None:
    from apps.metrics.ai_insights import validate_review

    snapshot = {
        "prompt_version": "weekly-v2",
        "evidence": {
            key: {"current": {"observed_days": 0}}
            for key in [
                "hrv",
                "steps",
                "workout_sets",
                "diet",
                "recovery",
                "stretching",
            ]
        },
    }
    report = comprehensive_review()
    if case == "duplicate_section":
        report["sections"][1]["key"] = "health"
    elif case == "foreign_domain":
        report["sections"][0]["evidence_keys"] = ["diet"]
    elif case == "invented_key":
        report["priorities"][0]["evidence_keys"] = ["invented"]
    elif case == "empty_connection":
        report["connections"] = [
            {"text": "Unsupported", "evidence_keys": ["steps", "hrv"]}
        ]
    elif case == "duplicate_connection_key":
        report["connections"] = [
            {"text": "Unsupported", "evidence_keys": ["hrv", "hrv"]}
        ]
    else:
        report["sections"][0]["text"] = "x" * 7001
    with pytest.raises(ValueError):
        validate_review(report, snapshot)


def test_empty_workout_does_not_count_as_recent_completed_sets() -> None:
    from apps.workouts.models import Workout

    user = User.objects.create_user(email="empty-session@example.com", password="test")
    Workout.objects.create(user=user, performed_on="2026-10-16")
    evidence = build_weekly_snapshot(
        user=user, zone=ZoneInfo("UTC"), now=datetime(2026, 10, 17, 12, tzinfo=UTC)
    )["evidence"]
    assert evidence["workouts"]["coverage"]["last_logged_on"] == "2026-10-16"
    assert evidence["workout_sets"]["coverage"]["last_logged_on"] is None


@override_settings(NVIDIA_API_KEY="test-only-not-a-real-key")
def test_selected_model_is_validated_and_passed_unchanged_to_the_job() -> None:
    from django.utils import timezone
    from datetime import timedelta

    client, user = pro_client()
    MetricEntry.objects.create(
        user=user,
        metric_definition=MetricDefinition.objects.get(user=None, slug="hrv"),
        value=44,
        recorded_at=timezone.now() - timedelta(days=1),
    )
    model = "nvidia/nemotron-3.5-super-vl-120b-a12b"
    preview = client.get(URL)
    assert model in {option["id"] for option in preview.data["models"]}
    with patch(
        "apps.metrics.ai_insights_views.generate_weekly_review_task.delay"
    ) as task:
        rejected = client.post(
            URL,
            {"timezone": "UTC", "consent": True, "model": "untrusted/model"},
            format="json",
        )
        assert rejected.status_code == 400
        task.assert_not_called()
        accepted = client.post(
            URL, {"timezone": "UTC", "consent": True, "model": model}, format="json"
        )
        assert accepted.status_code == 202
        assert task.call_args.args == (
            str(user.pk),
            "UTC",
            accepted.data["job_id"],
            model,
        )


@pytest.mark.parametrize(
    "model",
    [
        "nvidia/nemotron-3.5-super-vl-120b-a12b",
        "deepseek-ai/deepseek-v4.1-flash",
        "z-ai/glm-5.3-flash",
    ],
)
@override_settings(NVIDIA_API_KEY="test-only-not-a-real-key")
def test_selected_model_reaches_provider_and_result_metadata(model: str) -> None:
    from django.utils import timezone
    from datetime import timedelta

    client, user = pro_client()
    MetricEntry.objects.create(
        user=user,
        metric_definition=MetricDefinition.objects.get(user=None, slug="hrv"),
        value=44,
        recorded_at=timezone.now() - timedelta(days=1),
    )
    response = MagicMock()
    response.__enter__.return_value.read.return_value = json.dumps(
        {"choices": [{"message": {"content": json.dumps(suggestions_review())}}]}
    ).encode()
    with patch("apps.metrics.ai_insights.urlopen", return_value=response) as provider:
        started = client.post(
            URL, {"timezone": "UTC", "consent": True, "model": model}, format="json"
        )
        assert started.status_code == 202
        result = client.get(URL, {"job_id": started.data["job_id"]})
        assert result.data["status"] == "ready"
        assert result.data["result"]["model"] == model
        body = json.loads(provider.call_args.args[0].data)
        assert body["model"] == model
        if model.startswith("nvidia/"):
            assert body["chat_template_kwargs"] == {"enable_thinking": False}


@override_settings(NVIDIA_API_KEY="test-only-not-a-real-key")
def test_successful_review_survives_cache_expiry_and_is_restored_without_provider_call() -> (
    None
):
    from django.utils import timezone
    from datetime import timedelta
    from apps.metrics.models import WeeklyAiReview

    client, user = pro_client()
    MetricEntry.objects.create(
        user=user,
        metric_definition=MetricDefinition.objects.get(user=None, slug="hrv"),
        value=44,
        recorded_at=timezone.now() - timedelta(days=1),
    )
    response = MagicMock()
    response.__enter__.return_value.read.return_value = json.dumps(
        {"choices": [{"message": {"content": json.dumps(suggestions_review())}}]}
    ).encode()
    with patch("apps.metrics.ai_insights.urlopen", return_value=response) as provider:
        started = client.post(URL, {"timezone": "UTC", "consent": True}, format="json")
        assert started.status_code == 202
        result = client.get(URL, {"job_id": started.data["job_id"]}).data["result"]
        stored = WeeklyAiReview.objects.get(user=user)
        assert stored.id.hex == started.data["job_id"].replace("-", "")
        assert "Coverage limits" not in stored.result_encrypted
        from apps.metrics.tasks import generate_weekly_review_task

        generate_weekly_review_task(str(user.pk), "UTC", started.data["job_id"])
        assert WeeklyAiReview.objects.filter(user=user).count() == 1
        caches["ai_insights"].clear()
        restored = client.get(URL).data
        assert restored["latest_review"] == result
        assert restored["review_history"][0]["id"] == str(stored.pk)
        assert client.get(URL, {"review_id": str(stored.pk)}).data["result"] == result
        assert (
            client.get(URL, {"job_id": started.data["job_id"]}).data["result"] == result
        )
        assert provider.call_count == 1
        provider.side_effect = TimeoutError("provider unavailable")
        failed = client.post(URL, {"timezone": "UTC", "consent": True}, format="json")
        assert failed.status_code == 202
        assert (
            client.get(URL, {"job_id": failed.data["job_id"]}).data["status"]
            == "failed"
        )
        assert client.get(URL).data["latest_review"] == result
        assert WeeklyAiReview.objects.filter(user=user).count() == 1


@override_settings(NVIDIA_API_KEY="test-only-not-a-real-key")
def test_saved_reviews_are_owner_scoped_exported_and_deleted_with_account() -> None:
    from apps.metrics.models import WeeklyAiReview
    from apps.users.models import encrypt_value
    from apps.users.account import account_export
    from django.utils import timezone
    import uuid

    client, user = pro_client()
    other = User.objects.create_user(email="other-review@example.com", password="test")
    identifier = uuid.uuid4()
    result = {
        "id": str(identifier),
        "model": "z-ai/glm-5.3-flash",
        "generated_at": timezone.now().isoformat(),
        "snapshot": {"period": {"from": "2026-10-10", "to": "2026-10-16"}},
        "review": {"overview": "Private saved review"},
    }
    saved = WeeklyAiReview.objects.create(
        id=identifier,
        user=user,
        model=result["model"],
        timezone="UTC",
        period_start="2026-10-10",
        period_end="2026-10-16",
        generated_at=timezone.now(),
        result_encrypted=encrypt_value(json.dumps(result)),
    )
    client.force_authenticate(other)
    Subscription.objects.create(
        user=other,
        plan=SubscriptionPlan.objects.get(code="weekly-pro"),
        status="active",
    )
    assert client.get(URL, {"review_id": str(saved.pk)}).status_code == 404
    assert client.get(URL).data["latest_review"] is None
    assert client.get(URL).data["review_history"] == []
    exported = json.loads("".join(account_export(user)))
    assert (
        exported["ai_weekly_reviews"][0]["review"]["overview"] == "Private saved review"
    )
    assert "result_encrypted" not in str(exported)
    user.delete()
    assert not WeeklyAiReview.objects.filter(pk=identifier).exists()


@pytest.mark.parametrize(
    "model,effort",
    [("z-ai/glm-5.3-flash", "low"), ("deepseek-ai/deepseek-v4.1-flash", 1)],
)
def test_reasoning_models_use_their_documented_low_effort_settings(
    model: str, effort: str | int
) -> None:
    from apps.metrics.ai_insights import generate_weekly_review

    report = {
        "observations": [{"text": "Recorded data.", "evidence_keys": ["hrv"]}],
        "suggestion": "Compare routines.",
    }
    response = MagicMock()
    response.__enter__.return_value.read.return_value = json.dumps(
        {"choices": [{"message": {"content": json.dumps(report)}}]}
    ).encode()
    with patch("apps.metrics.ai_insights.urlopen", return_value=response) as provider:
        generate_weekly_review(
            {"evidence": {"hrv": {"current": {"observed_days": 1}}}},
            api_key="nvapi-test-personal",
            model=model,
        )
    assert json.loads(provider.call_args.args[0].data)["reasoning_effort"] == effort


def test_suggestions_only_review_rejects_recaps_and_requires_real_evidence() -> None:
    from apps.metrics.ai_insights import validate_review

    snapshot = {
        "prompt_version": "weekly-v3",
        "evidence": {"hrv": {"current": {"observed_days": 6}}},
    }
    report = {
        "suggestions": [
            {
                "text": "Keep your usual routine consistent; compare recovery next week.",
                "evidence_keys": ["hrv"],
            }
        ]
    }
    assert validate_review(report, snapshot) == report
    for invalid in [
        {**report, "overview": "A numerical recap."},
        {"suggestions": []},
        {"suggestions": [{"text": " ", "evidence_keys": ["hrv"]}]},
        {"suggestions": [{"text": "Try this.", "evidence_keys": ["invented"]}]},
        {"suggestions": [{"text": "Try this.", "evidence_keys": ["hrv", "hrv"]}]},
    ]:
        with pytest.raises(ValueError):
            validate_review(invalid, snapshot)


@override_settings(NVIDIA_API_KEY="test-only-not-a-real-key")
def test_queued_review_uses_the_exact_requested_snapshot_after_midnight() -> None:
    from apps.metrics.tasks import generate_weekly_review_task

    client, user = pro_client()
    snapshot = {
        "prompt_version": "weekly-v3",
        "timezone": "Europe/Tirane",
        "period": {"from": "2026-10-10", "to": "2026-10-16"},
        "previous_period": {"from": "2026-10-03", "to": "2026-10-09"},
        "evidence": {"hrv": {"current": {"observed_days": 1}}},
    }
    with (
        patch(
            "apps.metrics.ai_insights_views.build_weekly_snapshot",
            return_value=snapshot,
        ),
        patch("apps.metrics.ai_insights_views.generate_weekly_review_task.delay"),
    ):
        response = client.post(
            URL, {"timezone": "Europe/Tirane", "consent": True}, format="json"
        )
    with patch(
        "apps.metrics.tasks.generate_weekly_review", return_value=suggestions_review()
    ) as provider:
        generate_weekly_review_task(
            str(user.pk), "Europe/Tirane", response.data["job_id"]
        )
    assert provider.call_args.args[0] == snapshot
    result = client.get(URL, {"job_id": response.data["job_id"]})
    assert result.data["result"]["snapshot"] == snapshot


def test_suggestions_cannot_cite_only_empty_trackers() -> None:
    from apps.metrics.ai_insights import validate_review

    snapshot = {
        "prompt_version": "weekly-v3",
        "evidence": {
            "sleep_duration": {
                "current": {"observed_days": 0},
                "previous": {"observed_days": 0},
            },
            "hrv": {"current": {"observed_days": 2}},
        },
    }
    report = {
        "suggestions": [
            {"text": "Try a familiar routine.", "evidence_keys": ["sleep_duration"]}
        ]
    }
    with pytest.raises(ValueError):
        validate_review(report, snapshot)
    report["suggestions"][0]["evidence_keys"].append("hrv")
    assert validate_review(report, snapshot) == report


@pytest.mark.parametrize("timeframe,days", [("day", 1), ("week", 7), ("month", 30)])
def test_selected_timeframe_covers_completed_days_and_matching_previous_period(
    timeframe: str, days: int
) -> None:
    from datetime import timedelta
    from apps.diet.models import DietEntry, DietFood, DietSection
    from apps.workouts.models import Workout

    user = User.objects.create_user(email="period@example.com", password="test")
    end = datetime(2026, 10, 17, tzinfo=UTC).date()
    current_start = end - timedelta(days=days - 1)
    previous_start = current_start - timedelta(days=days)
    definition = MetricDefinition.objects.get(user=None, slug="hrv")
    section = DietSection.objects.create(user=user, name="Meals")
    food = DietFood.objects.create(section=section, name="Rice")
    for day, value in [
        (current_start, 50),
        (current_start - timedelta(days=1), 40),
        (previous_start - timedelta(days=1), 10),
        (end + timedelta(days=1), 90),
    ]:
        MetricEntry.objects.create(
            user=user,
            metric_definition=definition,
            value=value,
            recorded_at=datetime.combine(day, datetime.min.time(), tzinfo=UTC),
        )
        DietEntry.objects.create(user=user, food=food, performed_on=day)
        Workout.objects.create(user=user, performed_on=day, is_finished=True)
    snapshot = build_weekly_snapshot(
        user=user,
        zone=ZoneInfo("UTC"),
        now=datetime(2026, 10, 18, 12, tzinfo=UTC),
        timeframe=timeframe,
    )
    assert snapshot["timeframe"] == timeframe
    assert snapshot["period"] == {
        "from": current_start.isoformat(),
        "to": end.isoformat(),
    }
    assert snapshot["previous_period"] == {
        "from": previous_start.isoformat(),
        "to": (current_start - timedelta(days=1)).isoformat(),
    }
    assert len(snapshot["evidence"]["hrv"]["series"]) == 2 * days
    assert snapshot["evidence"]["hrv"]["current"]["daily_average"] == 50
    assert snapshot["evidence"]["hrv"]["previous"]["daily_average"] == 40
    assert snapshot["evidence"]["diet"]["current"]["count"] == 1
    assert snapshot["evidence"]["diet"]["previous"]["count"] == 1
    assert snapshot["evidence"]["workouts"]["current"]["count"] == 1
    assert snapshot["evidence"]["workouts"]["sessions"]["current"]["recorded"] == 1


@override_settings(NVIDIA_API_KEY="test-only-not-a-real-key")
@pytest.mark.parametrize("timeframe,days", [("day", 1), ("week", 7), ("month", 30)])
def test_timeframe_roundtrip_and_history_are_scoped_to_selected_period(
    timeframe: str, days: int
) -> None:
    from datetime import timedelta
    from django.utils import timezone
    from apps.metrics.models import WeeklyAiReview

    client, user = pro_client()
    MetricEntry.objects.create(
        user=user,
        metric_definition=MetricDefinition.objects.get(user=None, slug="hrv"),
        value=44,
        recorded_at=timezone.now() - timedelta(days=1),
    )
    preview = client.get(URL, {"timeframe": timeframe})
    assert preview.status_code == 200
    assert preview.data["snapshot"]["timeframe"] == timeframe
    assert len(preview.data["snapshot"]["evidence"]["hrv"]["series"]) == days * 2
    with patch(
        "apps.metrics.tasks.generate_weekly_review", return_value=suggestions_review()
    ):
        response = client.post(
            URL,
            {"timezone": "UTC", "consent": True, "timeframe": timeframe},
            format="json",
        )
    assert response.status_code == 202
    saved = WeeklyAiReview.objects.get(pk=response.data["job_id"])
    assert saved.timeframe == timeframe
    selected = client.get(URL, {"timeframe": timeframe}).data
    assert selected["latest_review"]["id"] == str(saved.pk)
    assert selected["review_history"][0]["timeframe"] == timeframe
    other = "day" if timeframe != "day" else "month"
    assert client.get(URL, {"timeframe": other}).data["latest_review"] is None
    assert client.get(URL, {"timeframe": other}).data["review_history"] == []
    assert client.get(URL, {"timeframe": "invalid"}).status_code == 400
    assert (
        client.post(
            URL,
            {"timezone": "UTC", "consent": True, "timeframe": "invalid"},
            format="json",
        ).status_code
        == 400
    )
