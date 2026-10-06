"""Timing: explicit start, repeat-safe pause, finish/reopen, correction,
ownership, validation, copies and account export; no browser clock authority.
"""

from datetime import datetime, timedelta, timezone
import json

import pytest
from rest_framework.test import APIClient

from apps.users.models import User

pytestmark = pytest.mark.django_db
BASE = "/api/v1/workouts/sessions/"


def client_for(email: str = "timing@example.com") -> APIClient:
    user = User.objects.create_user(email=email, password="password-123")
    client = APIClient()
    client.force_authenticate(user)
    return client


def test_explicit_timer_persists_and_repeat_actions_do_not_reset(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    client = client_for()
    now = datetime(2026, 10, 3, 12, tzinfo=timezone.utc)
    monkeypatch.setattr("django.utils.timezone.now", lambda: now)
    created = client.post(BASE, {"performed_on": "2026-10-03"}, format="json").json()
    assert created["duration_seconds"] is None
    assert created["timer_started_at"] is None
    url = BASE + created["id"] + "/"
    started = client.patch(url, {"timer_action": "start"}, format="json")
    assert started.status_code == 200
    assert started.json()["duration_seconds"] == 0
    stamp = started.json()["timer_started_at"]
    now += timedelta(seconds=45)
    assert client.get(url).json()["elapsed_seconds"] == 45
    assert (
        client.patch(url, {"timer_action": "start"}, format="json").json()[
            "timer_started_at"
        ]
        == stamp
    )
    paused = client.patch(url, {"timer_action": "pause"}, format="json").json()
    assert paused["duration_seconds"] == 45
    assert paused["timer_started_at"] is None
    now += timedelta(seconds=60)
    assert (
        client.patch(url, {"timer_action": "pause"}, format="json").json()[
            "elapsed_seconds"
        ]
        == 45
    )


def test_finish_reopen_resume_and_manual_correction(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    client = client_for()
    now = datetime(2026, 10, 3, 12, tzinfo=timezone.utc)
    monkeypatch.setattr("django.utils.timezone.now", lambda: now)
    w = client.post(BASE, {"performed_on": "2026-10-03"}, format="json").json()
    url = BASE + w["id"] + "/"
    client.patch(url, {"timer_action": "start"}, format="json")
    now += timedelta(seconds=90)
    finished = client.patch(url, {"is_finished": True}, format="json").json()
    assert finished["duration_seconds"] == 90
    assert finished["timer_started_at"] is None
    assert (
        client.patch(url, {"timer_action": "start"}, format="json").status_code == 400
    )
    assert (
        client.patch(url, {"duration_seconds": 120}, format="json").json()[
            "elapsed_seconds"
        ]
        == 120
    )
    client.patch(url, {"is_finished": False}, format="json")
    now += timedelta(seconds=30)
    assert client.get(url).json()["elapsed_seconds"] == 120
    client.patch(url, {"timer_action": "start"}, format="json")
    now += timedelta(seconds=20)
    corrected = client.patch(url, {"duration_seconds": 0}, format="json").json()
    assert corrected["duration_seconds"] == 0 and corrected["timer_started_at"] is None
    assert (
        client.patch(url, {"duration_seconds": None}, format="json").json()[
            "elapsed_seconds"
        ]
        is None
    )


@pytest.mark.parametrize(
    "payload",
    [
        {"duration_seconds": -1},
        {"duration_seconds": 604801},
        {"duration_seconds": 1.5},
        {"timer_action": "reset"},
        {"timer_action": "start", "duration_seconds": 60},
    ],
)
def test_invalid_timing_cannot_mutate(payload: dict[str, object]) -> None:
    client = client_for()
    w = client.post(BASE, {"performed_on": "2026-10-03"}, format="json").json()
    url = BASE + w["id"] + "/"
    assert client.patch(url, payload, format="json").status_code == 400
    assert client.get(url).json()["duration_seconds"] is None


def test_timing_is_private_copies_reset_and_readonly_clock_cannot_be_forged() -> None:
    client = client_for()
    other = client_for("other-timing@example.com")
    w = client.post(
        BASE, {"performed_on": "2026-10-03", "duration_seconds": 600}, format="json"
    ).json()
    url = BASE + w["id"] + "/"
    assert other.patch(url, {"timer_action": "start"}, format="json").status_code == 404
    assert (
        APIClient().patch(url, {"timer_action": "start"}, format="json").status_code
        == 401
    )
    forged = client.patch(
        url,
        {"timer_started_at": "2000-01-01T00:00:00Z", "elapsed_seconds": 9999},
        format="json",
    ).json()
    assert forged["timer_started_at"] is None and forged["elapsed_seconds"] == 600
    copied = client.post(
        url + "copy/", {"performed_on": "2026-10-04"}, format="json"
    ).json()
    assert copied["duration_seconds"] is None and copied["timer_started_at"] is None
    response = client.get("/api/v1/me/export/")
    exported = json.loads(b"".join(response.streaming_content))["workouts"]
    original = next(row for row in exported if row["id"] == w["id"])
    assert original["duration_seconds"] == 600


def test_elapsed_is_bounded_and_clock_rollback_does_not_subtract(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    client = client_for()
    now = datetime(2026, 10, 3, 12, tzinfo=timezone.utc)
    monkeypatch.setattr("django.utils.timezone.now", lambda: now)
    w = client.post(BASE, {"performed_on": "2026-10-03"}, format="json").json()
    url = BASE + w["id"] + "/"
    client.patch(url, {"timer_action": "start"}, format="json")
    now -= timedelta(seconds=10)
    assert client.get(url).json()["elapsed_seconds"] == 0
    now += timedelta(days=10)
    assert (
        client.patch(url, {"timer_action": "pause"}, format="json").json()[
            "elapsed_seconds"
        ]
        == 604800
    )
