from zoneinfo import ZoneInfo, ZoneInfoNotFoundError
import json
import uuid

from django.conf import settings
from django.core.cache import caches
from django.db import transaction
from django.views.decorators.debug import sensitive_variables, sensitive_post_parameters
from django.utils.decorators import method_decorator
from kombu.exceptions import OperationalError
from redis.exceptions import RedisError
from django.utils import timezone
from rest_framework import serializers
from rest_framework.exceptions import (
    APIException,
    PermissionDenied,
    NotFound,
    ValidationError,
)
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.metrics.ai_insights import (
    build_weekly_snapshot,
    available_review_models,
    TIMEFRAME_DAYS,
)
from apps.metrics.models import WeeklyAiReview
from apps.metrics.tasks import generate_weekly_review_task, review_job_key
from apps.subscriptions.services import get_current_subscription_plan
from apps.users.models import User, encrypt_value, decrypt_value


class WeeklyReviewUnavailable(APIException):
    status_code = 503
    default_detail = "AI generation is not configured yet. Your real data summary is available below."


class WeeklyReviewInput(serializers.Serializer):
    timezone = serializers.CharField(max_length=100)
    consent = serializers.BooleanField()
    model = serializers.CharField(max_length=150, required=False)
    timeframe = serializers.ChoiceField(choices=list(TIMEFRAME_DAYS), default="week")

    def validate_model(self, value: str) -> str:
        if value not in {item["id"] for item in available_review_models()}:
            raise serializers.ValidationError("Choose a supported NVIDIA model.")
        return value

    def validate(self, attrs: dict) -> dict:
        if set(self.initial_data) - {"timezone", "consent", "model", "timeframe"}:
            raise serializers.ValidationError("Unexpected input fields.")
        if attrs["consent"] is not True:
            raise serializers.ValidationError(
                "Confirm sharing your summary to generate insights."
            )
        return attrs


class WeeklyAiInsightsView(APIView):
    permission_classes = [IsAuthenticated]

    def _zone(self, request: Request, name: str) -> ZoneInfo:
        if not get_current_subscription_plan(request.user).analytics_enabled:
            raise PermissionDenied("Pro analytics are required.")
        try:
            return ZoneInfo(name)
        except (ZoneInfoNotFoundError, ValueError, TypeError) as exc:
            raise ValidationError(
                {"timezone": ["Enter a valid IANA timezone."]}
            ) from exc

    def get(self, request: Request) -> Response:
        zone = self._zone(request, request.query_params.get("timezone", "UTC"))
        if review_id := request.query_params.get("review_id"):
            try:
                identifier = uuid.UUID(review_id)
            except ValueError:
                raise ValidationError(
                    {"detail": "Invalid review identifier."}
                ) from None
            saved = WeeklyAiReview.objects.filter(
                pk=identifier, user=request.user
            ).first()
            if saved is None:
                raise NotFound("Saved review not found.")
            return self._response({"status": "ready", "result": saved.as_result()})
        if job_id := request.query_params.get("job_id"):
            try:
                job_id = str(uuid.UUID(job_id))
                stored = caches["ai_insights"].get(
                    review_job_key(str(request.user.pk), job_id)
                )
            except ValueError:
                raise ValidationError(
                    {"detail": "Invalid review identifier."}
                ) from None
            except RedisError:
                raise WeeklyReviewUnavailable() from None
            if stored is None:
                saved = WeeklyAiReview.objects.filter(
                    pk=job_id, user=request.user
                ).first()
                if saved is not None:
                    return self._response(
                        {"status": "ready", "result": saved.as_result()}
                    )
                return self._response(
                    {
                        "status": "expired",
                        "detail": "Review expired. Generate a new review.",
                    }
                )
            job = json.loads(decrypt_value(stored))
            if job.get("status") == "pending":
                return self._response({"status": "pending"})
            return self._response(job)
        timeframe = request.query_params.get("timeframe", "week")
        if timeframe not in TIMEFRAME_DAYS:
            raise ValidationError({"timeframe": ["Choose day, week or month."]})
        reviews = WeeklyAiReview.objects.filter(user=request.user, timeframe=timeframe)
        latest = reviews.first()
        return self._response(
            {
                "latest_review": latest.as_result() if latest else None,
                "review_history": [
                    {**row, "id": str(row["id"])}
                    for row in reviews.values(
                        "id",
                        "model",
                        "timeframe",
                        "generated_at",
                        "timezone",
                        "period_start",
                        "period_end",
                    )
                ],
                "available": bool(
                    request.user.ai_api_key_encrypted or settings.NVIDIA_API_KEY
                ),
                "model": settings.NVIDIA_INSIGHTS_MODEL,
                "models": available_review_models(),
                "snapshot": build_weekly_snapshot(
                    user=request.user,
                    zone=zone,
                    now=timezone.now(),
                    timeframe=timeframe,
                ),
            }
        )

    def post(self, request: Request) -> Response:
        serializer = WeeklyReviewInput(data=request.data)
        serializer.is_valid(raise_exception=True)
        zone = self._zone(request, serializer.validated_data["timezone"])
        if not request.user.ai_api_key_encrypted and not settings.NVIDIA_API_KEY:
            raise WeeklyReviewUnavailable()
        snapshot = build_weekly_snapshot(
            user=request.user,
            zone=zone,
            now=timezone.now(),
            timeframe=serializer.validated_data["timeframe"],
        )
        if not any(
            row["current"].get("observed_days", row["current"].get("logged_days", 0))
            for row in snapshot["evidence"].values()
        ):
            raise ValidationError(
                {"detail": "No tracker data in the selected completed period yet."}
            )
        cache = caches["ai_insights"]
        job_id = str(uuid.uuid4())
        key = review_job_key(str(request.user.pk), job_id)
        try:
            cache.set(
                key,
                encrypt_value(json.dumps({"status": "pending", "snapshot": snapshot})),
                timeout=3600,
            )
            generate_weekly_review_task.delay(
                str(request.user.pk),
                zone.key,
                job_id,
                serializer.validated_data.get("model", settings.NVIDIA_INSIGHTS_MODEL),
            )
        except RedisError, OperationalError:
            raise WeeklyReviewUnavailable() from None
        response = self._response({"job_id": job_id, "status": "pending"})
        response.status_code = 202
        return response

    def _response(self, data: dict) -> Response:
        response = Response(data)
        response["Cache-Control"] = "private, no-store"
        return response


class AiKeyInput(serializers.Serializer):
    api_key = serializers.RegexField(
        r"^nvapi-[A-Za-z0-9_-]+$", max_length=512, min_length=12, write_only=True
    )

    def validate(self, attrs: dict) -> dict:
        if set(self.initial_data) != {"api_key"}:
            raise serializers.ValidationError("Only api_key is accepted.")
        return attrs


@method_decorator(sensitive_post_parameters("api_key"), name="dispatch")
class AiApiKeyView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request: Request) -> Response:
        return self._response(bool(request.user.ai_api_key_encrypted))

    @sensitive_variables()
    def put(self, request: Request) -> Response:
        serializer = AiKeyInput(data=request.data)
        serializer.is_valid(raise_exception=True)
        with transaction.atomic():
            user = User.objects.select_for_update().get(pk=request.user.pk)
            user.ai_api_key_encrypted = encrypt_value(
                serializer.validated_data["api_key"]
            )
            user.save(update_fields=["ai_api_key_encrypted"])
        return self._response(True)

    def delete(self, request: Request) -> Response:
        with transaction.atomic():
            user = User.objects.select_for_update().get(pk=request.user.pk)
            user.ai_api_key_encrypted = ""
            user.save(update_fields=["ai_api_key_encrypted"])
        return self._response(False)

    def _response(self, configured: bool) -> Response:
        response = Response({"has_personal_key": configured})
        response["Cache-Control"] = "private, no-store"
        return response
