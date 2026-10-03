"""Server-side adjacent moves serialize with all other workout mutations."""

from django.db import transaction
from django.db.models import QuerySet
from django.shortcuts import get_object_or_404
from rest_framework import serializers
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.users.models import User
from .models import WorkoutExercise, WorkoutSet
from .serializers import WorkoutSerializer
from .views import require_open


class MoveInput(serializers.Serializer):
    direction = serializers.ChoiceField(choices=["up", "down"])

    def validate(self, attrs: dict) -> dict:
        if set(self.initial_data) - {"direction"}:
            raise ValidationError("Only direction can be supplied.")
        return attrs


def move_adjacent(rows: QuerySet, target_id: str, direction: str) -> None:
    items = list(rows.order_by("display_order", "id"))
    index = next(n for n, row in enumerate(items) if str(row.pk) == str(target_id))
    destination = index + (-1 if direction == "up" else 1)
    if not 0 <= destination < len(items):
        return
    items[index], items[destination] = items[destination], items[index]
    # Normalize ties and gaps while preserving the exact visible sequence.
    for n, row in enumerate(items, start=1):
        row.display_order = n * 10
    rows.model.objects.bulk_update(items, ["display_order"])


class MoveExerciseView(APIView):
    permission_classes = [IsAuthenticated]

    @transaction.atomic
    def post(self, request: Request, item_id: str) -> Response:
        User.objects.select_for_update().get(pk=request.user.pk)
        item = get_object_or_404(
            WorkoutExercise.objects.select_related("workout"),
            pk=item_id,
            workout__user=request.user,
            exercise__category__user=request.user,
        )
        require_open(item.workout)
        serializer = MoveInput(data=request.data)
        serializer.is_valid(raise_exception=True)
        move_adjacent(
            item.workout.exercises.all(),
            item_id,
            serializer.validated_data["direction"],
        )
        return Response(WorkoutSerializer(item.workout).data)


class MoveSetView(APIView):
    permission_classes = [IsAuthenticated]

    @transaction.atomic
    def post(self, request: Request, set_id: str) -> Response:
        User.objects.select_for_update().get(pk=request.user.pk)
        instance = get_object_or_404(
            WorkoutSet.objects.select_related("workout_exercise__workout"),
            pk=set_id,
            workout_exercise__workout__user=request.user,
            workout_exercise__exercise__category__user=request.user,
        )
        item = instance.workout_exercise
        require_open(item.workout)
        serializer = MoveInput(data=request.data)
        serializer.is_valid(raise_exception=True)
        move_adjacent(item.sets.all(), set_id, serializer.validated_data["direction"])
        return Response(WorkoutSerializer(item.workout).data)
