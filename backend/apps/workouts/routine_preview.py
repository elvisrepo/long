"""Read-only routine start plans with conservative completed-history matching."""

from collections import Counter
from datetime import date
from hashlib import sha256
import json
from typing import Any

from django.shortcuts import get_object_or_404
from rest_framework import serializers
from rest_framework.exceptions import ValidationError, APIException
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView
from apps.users.models import User
from .models import RoutineDay, WorkoutExercise
from .routine_serializers import RoutineExerciseSerializer
from .serializers import SessionCopySerializer

CARRY_FIELDS = {
    "strength": ("weight", "reps"),
    "bodyweight": ("weight", "reps"),
    "cardio": ("distance", "duration_seconds"),
    "duration": ("duration_seconds",),
}


class StaleRoutinePreview(APIException):
    status_code = 409
    default_detail = "The routine or previous performance changed. Refresh the preview before starting."


class RoutineStartInput(SessionCopySerializer):
    carry_forward = serializers.BooleanField(default=False)
    preview_token = serializers.RegexField(
        r"^[0-9a-f]{64}$", max_length=64, required=False
    )

    def validate(self, data: dict[str, Any]) -> dict[str, Any]:
        data = super().validate(data)
        if data["carry_forward"] and "preview_token" not in data:
            raise ValidationError("Preview carry-forward values before starting.")
        return data


class PreviewInput(serializers.Serializer):
    performed_on = serializers.DateField()
    carry_forward = serializers.BooleanField(default=False)

    def validate(self, data: dict[str, Any]) -> dict[str, Any]:
        if set(self.initial_data) - set(self.fields):
            raise ValidationError("Unexpected preview fields.")
        return data


def load_start_day(user: User, day_id: str) -> RoutineDay:
    day = get_object_or_404(
        RoutineDay.objects.select_related("routine__user").prefetch_related(
            "exercises__sets"
        ),
        pk=day_id,
        routine__user=user,
    )
    if not day.routine.is_active:
        raise ValidationError("Restore this routine before starting it.")
    if not day.exercises.exists():
        raise ValidationError("Add exercises to this routine day first.")
    if day.exercises.exclude(exercise__category__user=user).exists():
        raise ValidationError("This day contains an inaccessible exercise.")
    return day


def start_preview(
    day: RoutineDay, performed_on: date, carry_forward: bool
) -> dict[str, Any]:
    items = list(day.exercises.all())
    counts = Counter(
        (item.exercise_id, item.tracking_type, item.weight_unit, item.distance_unit)
        for item in items
    )
    output = []
    for item in items:
        result = dict(RoutineExerciseSerializer(item).data)
        result["sets"] = [dict(row, source=None) for row in result["sets"]]
        result["carry_reason"] = "Fixed template values; carry-forward is off."
        key = (
            item.exercise_id,
            item.tracking_type,
            item.weight_unit,
            item.distance_unit,
        )
        if carry_forward and counts[key] > 1:
            result["carry_reason"] = (
                "Duplicate routine occurrences: no automatic matching. Blanks stay blank."
            )
        elif carry_forward:
            history = WorkoutExercise.objects.filter(
                exercise_id=item.exercise_id,
                exercise__category__user=day.routine.user,
                workout__user=day.routine.user,
                workout__performed_on__lt=performed_on,
                tracking_type=item.tracking_type,
                weight_unit=item.weight_unit,
                distance_unit=item.distance_unit,
            )
            previous = (
                history.filter(sets__is_completed=True)
                .select_related("workout")
                .prefetch_related("sets")
                .order_by(
                    "-workout__performed_on",
                    "-workout__created_at",
                    "workout_id",
                    "display_order",
                    "id",
                )
                .first()
            )
            if previous is None:
                result["carry_reason"] = (
                    "No earlier completed history with matching type and units. Blanks stay blank."
                )
            elif history.filter(workout_id=previous.workout_id).count() > 1:
                result["carry_reason"] = (
                    "Duplicate occurrences in the previous workout: no automatic matching. Blanks stay blank."
                )
            else:
                result["carry_reason"] = (
                    "Blank fields only; set positions match the earlier workout. Uncompleted or missing positions stay blank."
                )
                old_sets = list(previous.sets.all())
                for n, row in enumerate(result["sets"]):
                    if n >= len(old_sets) or not old_sets[n].is_completed:
                        continue
                    fields = []
                    old = old_sets[n]
                    for field in CARRY_FIELDS.get(item.tracking_type, ()):
                        value = getattr(old, field)
                        if row[field] is None and value is not None:
                            row[field] = (
                                str(value) if field in {"weight", "distance"} else value
                            )
                            fields.append(field)
                    if fields:
                        row["source"] = {
                            "workout_id": str(previous.workout_id),
                            "item_id": str(previous.pk),
                            "set_id": str(old.pk),
                            "date": previous.workout.performed_on.isoformat(),
                            "fields": fields,
                        }
        output.append(result)
    plan = {
        "day_id": str(day.pk),
        "name": f"{day.routine.name} · {day.name}"[:120],
        "notes": day.notes,
        "performed_on": performed_on.isoformat(),
        "carry_forward": carry_forward,
        "exercises": output,
    }
    plan["preview_token"] = sha256(
        json.dumps(plan, sort_keys=True).encode()
    ).hexdigest()
    return plan


class RoutinePreviewView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request: Request, day_id: str) -> Response:
        day = load_start_day(request.user, day_id)
        serializer = PreviewInput(data=request.query_params)
        serializer.is_valid(raise_exception=True)
        return Response(start_preview(day, **serializer.validated_data))
