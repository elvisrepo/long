"""Owned routine copying and atomic template ordering; logged workouts are separate."""

from typing import Any
from django.db import transaction
from django.db.models import Max
from django.shortcuts import get_object_or_404
from rest_framework import serializers
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView
from apps.users.models import User
from .models import WorkoutRoutine, RoutineDay, RoutineExercise, RoutineSet
from .routine_serializers import RoutineSerializer, RoutineDaySerializer
from .routine_services import SNAPSHOT_FIELDS, QUANTITY_FIELDS
from .routine_views import require_active


class CopyInput(serializers.Serializer):
    name = serializers.CharField(max_length=120)


class RoutineCopyView(APIView):
    permission_classes = [IsAuthenticated]

    @transaction.atomic
    def post(self, request: Request, routine_id: str) -> Response:
        User.objects.select_for_update().get(pk=request.user.pk)
        source = get_object_or_404(
            WorkoutRoutine.objects.prefetch_related("days__exercises__sets"),
            pk=routine_id,
            user=request.user,
        )
        parameters = CopyInput(data=request.data)
        parameters.is_valid(raise_exception=True)
        order = (
            WorkoutRoutine.objects.filter(user=request.user).aggregate(
                value=Max("display_order")
            )["value"]
            or 0
        ) + 10
        serializer = RoutineSerializer(
            data={
                "name": parameters.validated_data["name"],
                "notes": source.notes,
                "display_order": order,
            },
            context={"request": request},
        )
        serializer.is_valid(raise_exception=True)
        copied = serializer.save(user=request.user, is_active=True)
        for day in source.days.all():
            saved_day = RoutineDay.objects.create(
                routine=copied,
                name=day.name,
                notes=day.notes,
                display_order=day.display_order,
            )
            for item in day.exercises.all():
                saved_item = RoutineExercise.objects.create(
                    day=saved_day,
                    **{field: getattr(item, field) for field in SNAPSHOT_FIELDS},
                )
                RoutineSet.objects.bulk_create(
                    [
                        RoutineSet(
                            routine_exercise=saved_item,
                            **{field: getattr(row, field) for field in QUANTITY_FIELDS},
                        )
                        for row in item.sets.all()
                    ]
                )
        return Response(RoutineSerializer(copied).data, status=201)


class RoutineOrderInput(serializers.Serializer):
    ids = serializers.ListField(child=serializers.UUIDField(), max_length=1000)
    expected_order = serializers.ListField(
        child=serializers.UUIDField(), max_length=1000
    )

    def validate(self, data: dict) -> dict:
        if set(self.initial_data) - {"ids", "expected_order"}:
            raise serializers.ValidationError("Only ordering fields can be supplied.")
        for field in ("ids", "expected_order"):
            if len(set(data[field])) != len(data[field]):
                raise serializers.ValidationError({field: "Use each item only once."})
        return data


class RoutineOrderView(APIView):
    permission_classes = [IsAuthenticated]

    @transaction.atomic
    def post(
        self, request: Request, routine_id: str | None = None, day_id: str | None = None
    ) -> Response:
        User.objects.select_for_update().get(pk=request.user.pk)
        rows: list[Any]
        parent: WorkoutRoutine | RoutineDay
        if routine_id is not None:
            parent = get_object_or_404(WorkoutRoutine, pk=routine_id, user=request.user)
            require_active(parent)
            rows = list(parent.days.all())
        else:
            parent = get_object_or_404(
                RoutineDay.objects.select_related("routine"),
                pk=day_id,
                routine__user=request.user,
            )
            require_active(parent.routine)
            rows = list(parent.exercises.all())
        serializer = RoutineOrderInput(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        current = [row.pk for row in rows]
        if current != data["expected_order"]:
            return Response(
                {
                    "detail": "This template changed. Close and reopen the order editor before saving."
                },
                status=409,
            )
        if set(current) != set(data["ids"]):
            raise serializers.ValidationError(
                {"ids": "Include every item from this routine or day exactly once."}
            )
        by_id = {row.pk: row for row in rows}
        for index, pk in enumerate(data["ids"], start=1):
            by_id[pk].display_order = index * 10
        if rows:
            type(rows[0]).objects.bulk_update(rows, ["display_order"])
        body = (
            RoutineSerializer(parent).data
            if routine_id is not None
            else RoutineDaySerializer(parent).data
        )
        return Response(body)
