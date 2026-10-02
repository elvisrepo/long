"""Owner-scoped strength goals, derived from completed frozen set snapshots."""

from decimal import Decimal
from typing import Any
from django.db import transaction
from django.db.models import QuerySet
from django.shortcuts import get_object_or_404
from rest_framework import serializers
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView
from apps.users.models import User
from .models import Exercise, ExerciseGoal, WorkoutSet
from .progress_views import StatisticsParameters
from .progress_queries import completed_sets, source, SOURCE_FIELDS, CHRONOLOGY


class GoalSerializer(serializers.ModelSerializer):
    target_weight = serializers.DecimalField(
        max_digits=8,
        decimal_places=3,
        min_value=Decimal(".001"),
        max_value=Decimal("10000"),
    )
    target_reps = serializers.IntegerField(min_value=1, max_value=10000)

    class Meta:
        model = ExerciseGoal
        fields = [
            "id",
            "target_weight",
            "target_reps",
            "rep_rule",
            "weight_unit",
            "distance_unit",
            "created_at",
        ]
        read_only_fields = ["id", "weight_unit", "distance_unit", "created_at"]

    def validate(self, data: dict[str, Any]) -> dict[str, Any]:
        if set(self.initial_data) - {"target_weight", "target_reps", "rep_rule"}:
            raise serializers.ValidationError(
                "Only target weight, reps and rep rule are editable; units are frozen."
            )
        if not data:
            raise serializers.ValidationError("Supply at least one target field.")
        return data


def goal_result(goal: ExerciseGoal, rows: QuerySet[WorkoutSet]) -> dict[str, Any]:
    qualifying = rows.filter(
        tracking_type="strength",
        weight_unit=goal.weight_unit,
        distance_unit=goal.distance_unit,
        weight__isnull=False,
    )
    qualifying = qualifying.filter(
        **{"reps" if goal.rep_rule == "exact" else "reps__gte": goal.target_reps}
    )
    best = qualifying.order_by("-weight", *CHRONOLOGY).values(*SOURCE_FIELDS).first()
    return {
        **GoalSerializer(goal).data,
        "achieved": best is not None and best["weight"] >= goal.target_weight,
        "best_weight": str(best["weight"]) if best else None,
        "progress_percent": str(
            min(Decimal(100), best["weight"] / goal.target_weight * 100).quantize(
                Decimal(".1")
            )
        )
        if best
        else "0.0",
        "source": source(best) if best else None,
        "source_date": best["date"].isoformat() if best else None,
    }


class ExerciseGoalsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request: Request, exercise_id: str) -> Response:
        exercise = get_object_or_404(
            Exercise.objects.select_related("category"),
            pk=exercise_id,
            category__user=request.user,
        )
        parameters = StatisticsParameters(data=request.query_params)
        parameters.is_valid(raise_exception=True)
        rows = completed_sets(exercise, parameters.validated_data["date_to"])
        return Response([goal_result(goal, rows) for goal in exercise.goals.all()])

    @transaction.atomic
    def post(self, request: Request, exercise_id: str) -> Response:
        User.objects.select_for_update().get(pk=request.user.pk)
        exercise = get_object_or_404(
            Exercise.objects.select_related("category"),
            pk=exercise_id,
            category__user=request.user,
        )
        if (
            exercise.tracking_type != "strength"
            or not exercise.is_active
            or not exercise.category.is_active
        ):
            raise serializers.ValidationError(
                "Create strength goals on active weight-and-reps exercises."
            )
        if exercise.goals.count() >= 20:
            raise serializers.ValidationError(
                "Keep at most 20 goals per exercise; remove an old goal first."
            )
        serializer = GoalSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save(
            exercise=exercise,
            weight_unit=exercise.weight_unit,
            distance_unit=exercise.distance_unit,
        )
        return Response(serializer.data, status=201)


class ExerciseGoalDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def owned(self, request: Request, goal_id: str) -> ExerciseGoal:
        User.objects.select_for_update().get(pk=request.user.pk)
        return get_object_or_404(
            ExerciseGoal, pk=goal_id, exercise__category__user=request.user
        )

    @transaction.atomic
    def patch(self, request: Request, goal_id: str) -> Response:
        goal = self.owned(request, goal_id)
        serializer = GoalSerializer(goal, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)

    @transaction.atomic
    def delete(self, request: Request, goal_id: str) -> Response:
        self.owned(request, goal_id).delete()
        return Response(status=204)
