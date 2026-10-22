from rest_framework import serializers
from rest_framework.pagination import LimitOffsetPagination
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView
from django.shortcuts import get_object_or_404
from django.db.models import Count, Min, Max, Sum, F, Q, DecimalField
from decimal import Decimal

from .models import Exercise, Workout
from .progress_queries import (
    METRICS,
    completed_sets,
    progress_points,
    best_records,
    record_history,
    record_json,
    point_json,
    PARTITION,
)


class StatisticsParameters(serializers.Serializer):
    date_to = serializers.DateField()
    date_from = serializers.DateField(required=False)
    workout_id = serializers.UUIDField(required=False)
    rep_limit = serializers.IntegerField(min_value=1, max_value=30, default=10)

    def validate(self, data: dict) -> dict:
        if data.get("date_from", data["date_to"]) > data["date_to"]:
            raise serializers.ValidationError("Choose an ordered date range.")
        return data


class ExerciseStatisticsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request: Request, exercise_id: str) -> Response:
        exercise = get_object_or_404(
            Exercise.objects.select_related("category"),
            pk=exercise_id,
            category__user=request.user,
        )
        parameters = StatisticsParameters(data=request.query_params)
        parameters.is_valid(raise_exception=True)
        data = parameters.validated_data
        rows = completed_sets(exercise, data["date_to"])
        if "date_from" in data:
            rows = rows.filter(date__gte=data["date_from"])
        if "workout_id" in data:
            get_object_or_404(Workout, pk=data["workout_id"], user=request.user)
            rows = rows.filter(workout_id=data["workout_id"])
        groups = list(
            rows.values(*PARTITION)
            .annotate(
                session_count=Count("workout_id", distinct=True),
                set_count=Count("id"),
                first_date=Min("date"),
                last_date=Max("date"),
                reps_total=Sum(
                    "reps", filter=Q(tracking_type__in=["strength", "bodyweight"])
                ),
                volume_total=Sum(
                    F("weight") * F("reps"),
                    filter=Q(tracking_type="strength"),
                    output_field=DecimalField(max_digits=30, decimal_places=3),
                ),
                distance_total=Sum("distance", filter=Q(tracking_type="cardio")),
                duration_seconds_total=Sum(
                    "duration_seconds",
                    filter=Q(tracking_type__in=["cardio", "duration"]),
                ),
            )
            .order_by(*PARTITION)
        )
        for group in groups:
            partition = rows.filter(**{field: group[field] for field in PARTITION})
            metrics = {
                "strength": [
                    "max_weight",
                    "max_reps",
                    "max_volume",
                    "workout_volume",
                    "estimated_1rm",
                ],
                "bodyweight": ["max_weight", "max_reps"],
                "cardio": ["max_distance", "max_duration", "max_speed", "best_pace"],
                "duration": ["max_duration"],
            }[group["tracking_type"]]
            group["bests"] = {}
            for metric in metrics:
                best = (
                    progress_points(partition, metric, rep_limit=data["rep_limit"])
                    .order_by(
                        "value" if metric == "best_pace" else "-value",
                        "date",
                        "workout_id",
                    )
                    .first()
                )
                if best:
                    group["bests"][metric] = point_json(best)
            for field in ("volume_total", "distance_total"):
                if group[field] is not None:
                    group[field] = str(group[field].quantize(Decimal(".001")))
        return Response(
            {
                "exercise_id": str(exercise.pk),
                "date_to": parameters.validated_data["date_to"],
                "groups": groups,
            }
        )


class SummaryParameters(serializers.Serializer):
    date_to = serializers.DateField()
    limit = serializers.IntegerField(min_value=1, max_value=500, default=100)
    offset = serializers.IntegerField(min_value=0, default=0)


class ProgressParameters(SummaryParameters):
    rep_limit = serializers.IntegerField(min_value=1, max_value=30, default=10)
    per_workout = serializers.BooleanField(default=False)
    metric = serializers.ChoiceField(choices=METRICS, default="max_weight")
    reps = serializers.IntegerField(min_value=1, max_value=10000, default=5)


class SummaryPagination(LimitOffsetPagination):
    default_limit = 100
    max_limit = 500


class RecordsParameters(SummaryParameters):
    history = serializers.BooleanField(default=False)
    newest_first = serializers.BooleanField(default=False)
    reps = serializers.IntegerField(min_value=1, max_value=10000, required=False)
    weight_unit = serializers.ChoiceField(choices=["kg", "lb"], required=False)
    distance_unit = serializers.ChoiceField(choices=["km", "mi"], required=False)


class ExerciseRecordsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request: Request, exercise_id: str) -> Response:
        exercise = get_object_or_404(
            Exercise.objects.select_related("category"),
            pk=exercise_id,
            category__user=request.user,
        )
        parameters = RecordsParameters(data=request.query_params)
        parameters.is_valid(raise_exception=True)
        rows = completed_sets(exercise, parameters.validated_data["date_to"])
        for field in ("reps", "weight_unit", "distance_unit"):
            if field in parameters.validated_data:
                rows = rows.filter(**{field: parameters.validated_data[field]})
        pagination = SummaryPagination()
        values = (
            record_history(rows)
            if parameters.validated_data["history"]
            else best_records(rows)
        )
        if (
            parameters.validated_data["history"]
            and parameters.validated_data["newest_first"]
        ):
            values = values.reverse()
        records = pagination.paginate_queryset(values, request)
        return pagination.get_paginated_response([record_json(row) for row in records])


class ExerciseProgressView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request: Request, exercise_id: str) -> Response:
        exercise = get_object_or_404(
            Exercise.objects.select_related("category"),
            pk=exercise_id,
            category__user=request.user,
        )
        parameters = ProgressParameters(data=request.query_params)
        parameters.is_valid(raise_exception=True)
        rows = completed_sets(exercise, parameters.validated_data["date_to"])
        pagination = SummaryPagination()
        data = parameters.validated_data
        rep_maxes = data["metric"] == "rep_maxes"
        values = (
            record_history(rows.filter(reps=data["reps"]))
            if rep_maxes
            else progress_points(
                rows,
                data["metric"],
                data["reps"],
                data["rep_limit"],
                data["per_workout"],
            )
        )
        points = pagination.paginate_queryset(values, request)
        results = [
            record_json(point)
            if rep_maxes
            else point_json(point, include_session=data["per_workout"])
            for point in points
        ]
        response = pagination.get_paginated_response(results)
        response.data["types"] = sorted(
            set(rows.values_list("tracking_type", flat=True).distinct())
        )
        return response
