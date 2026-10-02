from rest_framework import serializers
from rest_framework.pagination import LimitOffsetPagination
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView
from django.shortcuts import get_object_or_404

from .models import Exercise
from .progress_queries import (
    METRICS,
    completed_sets,
    progress_points,
    best_records,
    record_history,
    record_json,
    point_json,
)


class SummaryParameters(serializers.Serializer):
    date_to = serializers.DateField()
    limit = serializers.IntegerField(min_value=1, max_value=500, default=100)
    offset = serializers.IntegerField(min_value=0, default=0)


class ProgressParameters(SummaryParameters):
    metric = serializers.ChoiceField(choices=METRICS, default="max_weight")
    reps = serializers.IntegerField(min_value=1, max_value=10000, default=5)


class SummaryPagination(LimitOffsetPagination):
    default_limit = 100
    max_limit = 500


class RecordsParameters(SummaryParameters):
    history = serializers.BooleanField(default=False)
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
        records = pagination.paginate_queryset(
            record_history(rows)
            if parameters.validated_data["history"]
            else best_records(rows),
            request,
        )
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
        points = pagination.paginate_queryset(
            progress_points(
                rows,
                parameters.validated_data["metric"],
                parameters.validated_data["reps"],
            ),
            request,
        )
        results = [point_json(point) for point in points]
        response = pagination.get_paginated_response(results)
        response.data["types"] = sorted(
            set(rows.values_list("tracking_type", flat=True).distinct())
        )
        return response
