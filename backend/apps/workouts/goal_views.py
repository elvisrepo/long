"""Owner-scoped goals, derived from completed frozen set snapshots."""

from decimal import Decimal
from typing import Any
from django.db import transaction
from django.db.models import QuerySet, F, Value, DecimalField
from django.db.models.functions import Cast
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
        required=False,
    )
    target_reps = serializers.IntegerField(min_value=1, max_value=10000, required=False)
    target_value = serializers.DecimalField(
        max_digits=12,
        decimal_places=3,
        min_value=Decimal(".001"),
        max_value=Decimal("604800"),
        required=False,
    )

    class Meta:
        model = ExerciseGoal
        fields = [
            "id",
            "goal_type",
            "tracking_type",
            "target_value",
            "target_weight",
            "target_reps",
            "rep_rule",
            "weight_unit",
            "distance_unit",
            "created_at",
        ]
        read_only_fields = [
            "id",
            "weight_unit",
            "distance_unit",
            "tracking_type",
            "created_at",
        ]

    def validate(self, data: dict[str, Any]) -> dict[str, Any]:
        kind = (
            self.instance.goal_type
            if self.instance
            else data.get("goal_type", "strength")
        )
        allowed = (
            {"target_weight", "target_reps", "rep_rule"}
            if kind == "strength"
            else {"target_value"}
        )
        if self.instance is None:
            allowed.add("goal_type")
        if set(self.initial_data) - allowed:
            raise serializers.ValidationError(
                "Supply only this goal's target fields; type and units are frozen."
            )
        if not data:
            raise serializers.ValidationError("Supply at least one target field.")
        if kind == "strength":
            if (
                self.instance is None
                and not {"target_weight", "target_reps"} <= data.keys()
            ):
                raise serializers.ValidationError(
                    "Strength goals require weight and reps."
                )
        else:
            value = data.get(
                "target_value", self.instance.target_value if self.instance else None
            )
            if value is None:
                raise serializers.ValidationError("Supply a target value.")
            if kind in ["reps", "duration"] and (
                value != value.to_integral_value() or value < 1
            ):
                raise serializers.ValidationError(
                    "Reps and duration require positive whole numbers."
                )
            if kind != "duration" and value > 100000:
                raise serializers.ValidationError("This target cannot exceed 100000.")
        return data


def goal_result(goal: ExerciseGoal, rows: QuerySet[WorkoutSet]) -> dict[str, Any]:
    if goal.goal_type != "strength":
        return metric_goal_result(goal, rows)
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
        "best_value": str(best["weight"]) if best else None,
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


def metric_goal_result(
    goal: ExerciseGoal, rows: QuerySet[WorkoutSet]
) -> dict[str, Any]:
    rows = rows.filter(
        tracking_type=goal.tracking_type,
        weight_unit=goal.weight_unit,
        distance_unit=goal.distance_unit,
    )
    number = DecimalField(max_digits=24, decimal_places=8)
    if goal.goal_type in ["max_speed", "best_pace"]:
        rows = rows.filter(distance__gt=0, duration_seconds__gt=0)
        distance, duration = (
            Cast(F("distance"), number),
            Cast(F("duration_seconds"), number),
        )
        value = (
            distance * Value(Decimal(3600)) / duration
            if goal.goal_type == "max_speed"
            else duration / (distance * Value(Decimal(60)))
        )
    else:
        field = {
            "reps": "reps",
            "distance": "distance",
            "duration": "duration_seconds",
        }[goal.goal_type]
        rows = rows.filter(**{field + "__gt": 0})
        value = Cast(F(field), number)
    lower = goal.goal_type == "best_pace"
    best = (
        rows.annotate(goal_value=value)
        .order_by("goal_value" if lower else "-goal_value", *CHRONOLOGY)
        .values(*SOURCE_FIELDS, "goal_value", "distance", "duration_seconds")
        .first()
    )
    actual = best["goal_value"] if best else None
    target = goal.target_value
    achieved = bool(
        actual is not None and (actual <= target if lower else actual >= target)
    )
    percent = (
        min(
            Decimal(100), (target / actual if lower else actual / target) * 100
        ).quantize(Decimal(".1"))
        if actual is not None
        else Decimal("0.0")
    )
    if not achieved:
        percent = min(Decimal("99.9"), percent)
    return {
        **GoalSerializer(goal).data,
        "achieved": achieved,
        "best_weight": None,
        "best_value": str(actual) if actual is not None else None,
        "progress_percent": str(percent),
        "source": {
            **source(best),
            "distance": str(best["distance"]) if best["distance"] is not None else None,
            "duration_seconds": best["duration_seconds"],
        }
        if best
        else None,
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
        if not exercise.is_active or not exercise.category.is_active:
            raise serializers.ValidationError(
                "Create goals on active exercises and categories."
            )
        if exercise.goals.count() >= 20:
            raise serializers.ValidationError(
                "Keep at most 20 goals per exercise; remove an old goal first."
            )
        serializer = GoalSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        kind = serializer.validated_data.get("goal_type", "strength")
        allowed = {
            "strength": ["strength"],
            "bodyweight": ["reps"],
            "cardio": ["distance", "duration", "max_speed", "best_pace"],
            "duration": ["duration"],
        }
        if kind not in allowed[exercise.tracking_type]:
            raise serializers.ValidationError(
                "Choose a goal supported by this exercise type."
            )
        serializer.save(
            exercise=exercise,
            tracking_type=exercise.tracking_type,
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
