"""Atomic exercise selection actions, serialized with other workout writes."""

from typing import Any

from django.db import transaction
from django.shortcuts import get_object_or_404
from rest_framework import serializers
from rest_framework.exceptions import NotFound, ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.users.models import User
from .models import Workout, WorkoutExercise
from .serializers import WorkoutSerializer
from .views import require_open


class ExerciseActionInput(serializers.Serializer):
    action = serializers.ChoiceField(choices=["delete", "reorder"])
    exercise_ids = serializers.ListField(
        child=serializers.UUIDField(), allow_empty=False
    )
    expected_order = serializers.ListField(
        child=serializers.UUIDField(), required=False
    )

    def validate(self, attrs: dict[str, Any]) -> dict[str, Any]:
        if set(self.initial_data) - {"action", "exercise_ids", "expected_order"}:
            raise ValidationError(
                "Only action, exercise_ids and expected_order may be supplied."
            )
        if len(attrs["exercise_ids"]) != len(set(attrs["exercise_ids"])):
            raise ValidationError("Select each exercise once.")
        if attrs["action"] == "reorder" and "expected_order" not in attrs:
            raise ValidationError("Reordering requires the previous order.")
        if attrs["action"] == "delete" and "expected_order" in attrs:
            raise ValidationError("Deletion does not accept an order.")
        return attrs


class ExerciseActionsView(APIView):
    permission_classes = [IsAuthenticated]

    @transaction.atomic
    def post(self, request: Request, workout_id: str) -> Response:
        User.objects.select_for_update().get(pk=request.user.pk)
        workout = get_object_or_404(Workout, pk=workout_id, user=request.user)
        require_open(workout)
        serializer = ExerciseActionInput(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        items = list(
            workout.exercises.select_related("exercise__category").order_by(
                "display_order", "id"
            )
        )
        owned = {
            item.id: item
            for item in items
            if item.exercise.category.user_id == request.user.pk
        }
        ids = data["exercise_ids"]
        if not set(ids).issubset(owned):
            raise NotFound("One or more selected exercises are unavailable.")
        if data["action"] == "delete":
            WorkoutExercise.objects.filter(workout=workout, id__in=ids).delete()
        else:
            if data["expected_order"] != [item.id for item in items]:
                return Response(
                    {"detail": "Workout order changed. Refresh before reordering."},
                    status=409,
                )
            if set(ids) != set(owned) or len(ids) != len(items):
                raise ValidationError("Supply every workout exercise exactly once.")
            reordered = [owned[item_id] for item_id in ids]
            for index, item in enumerate(reordered, start=1):
                item.display_order = index * 10
            WorkoutExercise.objects.bulk_update(reordered, ["display_order"])
        return Response(WorkoutSerializer(workout).data)
