"""Bounded AI jobs. Queue messages contain identifiers only, never credentials."""

import json
from typing import Any

from celery import shared_task
from django.conf import settings
from django.core.cache import caches
from django.db import transaction
from apps.metrics.models import WeeklyAiReview
from django.utils import timezone
from celery.exceptions import SoftTimeLimitExceeded

from apps.metrics.ai_insights import (
    generate_weekly_review,
    WeeklyReviewFailed,
)
from apps.users.models import User, decrypt_value, encrypt_value


def review_job_key(user_id: str, job_id: str) -> str:
    return f"ai-weekly-job:{user_id}:{job_id}"


@shared_task(ignore_result=True, soft_time_limit=110, time_limit=120, expires=3600)
def generate_weekly_review_task(
    user_id: str, timezone_name: str, job_id: str, model: str | None = None
) -> None:
    cache = caches["ai_insights"]
    selected_model = model or settings.NVIDIA_INSIGHTS_MODEL
    key = review_job_key(user_id, job_id)
    # An expired/cancelled job must not initiate a provider request.
    pending = cache.get(key)
    if not pending:
        return
    saved = WeeklyAiReview.objects.filter(pk=job_id, user_id=user_id).first()
    if saved is not None:
        cache.set(
            key,
            encrypt_value(json.dumps({"status": "ready", "result": saved.as_result()})),
            timeout=3600,
        )
        return
    user = User.objects.filter(pk=user_id).first()
    if user is None:
        cache.delete(key)
        return
    result: dict[str, Any]
    try:
        api_key = (
            decrypt_value(user.ai_api_key_encrypted)
            if user.ai_api_key_encrypted
            else settings.NVIDIA_API_KEY
        )
        if not api_key:
            raise ValueError("No configured key")
        snapshot = json.loads(decrypt_value(pending))["snapshot"]
        review = generate_weekly_review(snapshot, api_key=api_key, model=selected_model)
        result = {
            "status": "ready",
            "result": {
                "id": job_id,
                "snapshot": snapshot,
                "review": review,
                "generated_at": timezone.now().isoformat(),
                "model": selected_model,
            },
        }
    except WeeklyReviewFailed as error:
        result = {"status": "failed", "detail": str(error.detail)}
    except SoftTimeLimitExceeded, ValueError:
        result = {"status": "failed", "detail": str(WeeklyReviewFailed.default_detail)}
    if result["status"] == "ready":
        with transaction.atomic():
            owner = User.objects.select_for_update().filter(pk=user_id).first()
            if owner is None:
                cache.delete(key)
                return
            payload = result["result"]
            WeeklyAiReview.objects.get_or_create(
                pk=job_id,
                user=owner,
                defaults={
                    "model": selected_model,
                    "timezone": timezone_name,
                    "period_start": payload["snapshot"]["period"]["from"],
                    "period_end": payload["snapshot"]["period"]["to"],
                    "generated_at": payload["generated_at"],
                    "result_encrypted": encrypt_value(json.dumps(payload)),
                },
            )
    if User.objects.filter(pk=user_id).exists():
        cache.set(key, encrypt_value(json.dumps(result)), timeout=3600)
    else:
        cache.delete(key)
