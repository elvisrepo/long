"""All-or-nothing history corrections; never silently overwrite a stale preview."""

from typing import Any

from django.db import transaction
from rest_framework import serializers
from rest_framework.exceptions import NotFound, ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.users.models import User
from .models import WorkoutSet
from .serializers import SetSerializer
from .views import require_open


class SelectedSet(serializers.Serializer):
    id = serializers.UUIDField()
    expected = serializers.DictField()

    def to_internal_value(self, data: Any) -> dict[str, Any]:
        if isinstance(data, dict) and set(data) - {"id", "expected"}:
            raise ValidationError("Only id and expected may be supplied.")
        return super().to_internal_value(data)


class BulkInput(serializers.Serializer):
    action = serializers.ChoiceField(choices=["update", "delete"])
    sets = SelectedSet(many=True, min_length=1, max_length=100)
    changes = serializers.DictField(required=False)

    def validate(self, attrs: dict[str, Any]) -> dict[str, Any]:
        if set(self.initial_data) - {"action", "sets", "changes"}:
            raise ValidationError("Only action, sets and changes may be supplied.")
        ids = [row["id"] for row in attrs["sets"]]
        if len(ids) != len(set(ids)):
            raise ValidationError("Select each set only once.")
        changes = attrs.get("changes", {})
        allowed = {
            "weight",
            "reps",
            "distance",
            "duration_seconds",
            "comment",
            "is_completed",
        }
        if attrs["action"] == "update" and (not changes or set(changes) - allowed):
            raise ValidationError(
                "Provide only editable set values, comment or completion."
            )
        if attrs["action"] == "delete" and "changes" in attrs:
            raise ValidationError("Deletion does not accept changes.")
        return attrs


class BulkSetsView(APIView):
    permission_classes = [IsAuthenticated]

    @transaction.atomic
    def post(self, request: Request) -> Response:
        User.objects.select_for_update().get(pk=request.user.pk)
        serializer = BulkInput(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        ids = [row["id"] for row in data["sets"]]
        rows = list(
            WorkoutSet.objects.filter(
                pk__in=ids,
                workout_exercise__workout__user=request.user,
                workout_exercise__exercise__category__user=request.user,
            ).select_related("workout_exercise__workout")
        )
        if len(rows) != len(ids):
            raise NotFound(
                "Some selected sets are unavailable. Refresh history and review again."
            )
        expected = {row["id"]: row["expected"] for row in data["sets"]}
        for row in rows:
            require_open(row.workout_exercise.workout)
            if dict(SetSerializer(row).data) != expected[row.pk]:
                return Response(
                    {
                        "detail": "A selected set changed. Refresh history and review again; nothing was changed."
                    },
                    status=409,
                )
        if data["action"] == "delete":
            WorkoutSet.objects.filter(pk__in=ids).delete()
        else:
            if set(data["changes"]) & {
                "weight",
                "reps",
                "distance",
                "duration_seconds",
            }:
                partitions = {
                    (
                        row.workout_exercise.tracking_type,
                        row.workout_exercise.weight_unit,
                        row.workout_exercise.distance_unit,
                    )
                    for row in rows
                }
                if len(partitions) != 1:
                    raise ValidationError(
                        "Numeric edits require matching saved types and units."
                    )
            edits = [
                SetSerializer(row, data=data["changes"], partial=True) for row in rows
            ]
            for edit in edits:
                edit.is_valid(raise_exception=True)
            for edit in edits:
                edit.save()
        return Response({"affected_count": len(rows)})
