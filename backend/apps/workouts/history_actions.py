"""Append selected historical sets to an existing exercise as plans."""

from typing import Any
from django.db import transaction
from django.db.models import Max
from django.shortcuts import get_object_or_404
from rest_framework import serializers
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView
from apps.users.models import User
from .models import Workout, WorkoutExercise, WorkoutSet
from .serializers import SetSerializer
from .views import require_open


class CopySetsInput(serializers.Serializer):
    source_workout_id = serializers.UUIDField()
    set_ids = serializers.ListField(
        child=serializers.UUIDField(), min_length=1, max_length=100
    )

    def validate(self, data: dict[str, Any]) -> dict[str, Any]:
        if set(self.initial_data) - {"source_workout_id", "set_ids"}:
            raise ValidationError("Only source_workout_id and set_ids can be supplied.")
        if len(data["set_ids"]) != len(set(data["set_ids"])):
            raise ValidationError("Choose each source set once.")
        return data


class CopySetsView(APIView):
    permission_classes = [IsAuthenticated]

    @transaction.atomic
    def post(self, request: Request, item_id: str) -> Response:
        User.objects.select_for_update().get(pk=request.user.pk)
        items = WorkoutExercise.objects.select_related("workout").filter(
            workout__user=request.user, exercise__category__user=request.user
        )
        target = get_object_or_404(items, pk=item_id)
        require_open(target.workout)
        serializer = CopySetsInput(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        source = get_object_or_404(
            Workout, pk=data["source_workout_id"], user=request.user
        )
        selected = list(
            WorkoutSet.objects.select_related("workout_exercise")
            .filter(
                workout_exercise__workout=source,
                workout_exercise__exercise__category__user=request.user,
                pk__in=data["set_ids"],
            )
            .order_by(
                "workout_exercise__display_order",
                "workout_exercise_id",
                "display_order",
                "id",
            )
        )
        if len(selected) != len(data["set_ids"]):
            raise ValidationError("Choose sets from the source workout.")
        partition = ("exercise_id", "tracking_type", "weight_unit", "distance_unit")
        if any(
            any(
                getattr(row.workout_exercise, key) != getattr(target, key)
                for key in partition
            )
            for row in selected
        ):
            raise ValidationError(
                "Copy requires the same exercise, tracking type and saved units."
            )
        order = target.sets.aggregate(value=Max("display_order"))["value"] or 0
        created = WorkoutSet.objects.bulk_create(
            [
                WorkoutSet(
                    workout_exercise=target,
                    display_order=order + (index + 1) * 10,
                    weight=row.weight,
                    reps=row.reps,
                    distance=row.distance,
                    duration_seconds=row.duration_seconds,
                    comment="",
                    is_completed=False,
                )
                for index, row in enumerate(selected)
            ]
        )
        return Response(SetSerializer(created, many=True).data, status=201)
