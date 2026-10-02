from django.db import transaction
from django.db.models import Max
from django.shortcuts import get_object_or_404
from rest_framework.permissions import IsAuthenticated
from rest_framework.exceptions import ValidationError
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView
from apps.users.models import User
from .models import WorkoutRoutine, RoutineDay, RoutineExercise, RoutineSet
from .routine_serializers import RoutineSerializer, RoutineDaySerializer
from .routine_serializers import (
    RoutineExerciseInputSerializer,
    RoutineExerciseSerializer,
    RoutineSetInputSerializer,
)
from .routine_services import capture_day, start_day
from .serializers import CopySerializer, WorkoutSerializer, ExerciseSettingsSerializer


class RoutinesView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request: Request) -> Response:
        routines = WorkoutRoutine.objects.filter(user=request.user).prefetch_related(
            "days__exercises__sets"
        )
        return Response(RoutineSerializer(routines, many=True).data)

    @transaction.atomic
    def post(self, request: Request) -> Response:
        User.objects.select_for_update().get(pk=request.user.pk)
        serializer = RoutineSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        serializer.save(user=request.user, is_active=True)
        return Response(serializer.data, status=201)


class RoutineDetailView(APIView):
    permission_classes = [IsAuthenticated]

    @transaction.atomic
    def patch(self, request: Request, routine_id: str) -> Response:
        User.objects.select_for_update().get(pk=request.user.pk)
        routine = get_object_or_404(WorkoutRoutine, pk=routine_id, user=request.user)
        serializer = RoutineSerializer(
            routine, data=request.data, partial=True, context={"request": request}
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)


def require_active(routine: WorkoutRoutine) -> None:
    if not routine.is_active:
        raise ValidationError(
            "Restore the routine before changing or starting its days."
        )


class RoutineDaysView(APIView):
    permission_classes = [IsAuthenticated]

    @transaction.atomic
    def post(self, request: Request, routine_id: str) -> Response:
        User.objects.select_for_update().get(pk=request.user.pk)
        routine = get_object_or_404(WorkoutRoutine, pk=routine_id, user=request.user)
        require_active(routine)
        serializer = RoutineDaySerializer(
            data=request.data, context={"request": request, "routine": routine}
        )
        serializer.is_valid(raise_exception=True)
        source = serializer.validated_data.pop("source_workout", None)
        order = (routine.days.aggregate(value=Max("display_order"))["value"] or 0) + 10
        day = serializer.save(
            routine=routine,
            display_order=serializer.validated_data.get("display_order", order),
        )
        if source:
            capture_day(day, source)
        return Response(serializer.data, status=201)


class RoutineDayDetailView(APIView):
    permission_classes = [IsAuthenticated]

    @transaction.atomic
    def patch(self, request: Request, day_id: str) -> Response:
        User.objects.select_for_update().get(pk=request.user.pk)
        day = get_object_or_404(
            RoutineDay.objects.select_related("routine"),
            pk=day_id,
            routine__user=request.user,
        )
        require_active(day.routine)
        serializer = RoutineDaySerializer(
            day,
            data=request.data,
            partial=True,
            context={"request": request, "routine": day.routine},
        )
        serializer.is_valid(raise_exception=True)
        source = serializer.validated_data.pop("source_workout", None)
        serializer.save()
        if source:
            capture_day(day, source)
        return Response(serializer.data)

    @transaction.atomic
    def delete(self, request: Request, day_id: str) -> Response:
        User.objects.select_for_update().get(pk=request.user.pk)
        day = get_object_or_404(
            RoutineDay.objects.select_related("routine"),
            pk=day_id,
            routine__user=request.user,
        )
        require_active(day.routine)
        day.delete()
        return Response(status=204)


class StartRoutineDayView(APIView):
    permission_classes = [IsAuthenticated]

    @transaction.atomic
    def post(self, request: Request, day_id: str) -> Response:
        User.objects.select_for_update().get(pk=request.user.pk)
        day = get_object_or_404(
            RoutineDay.objects.select_related("routine__user").prefetch_related(
                "exercises__sets"
            ),
            pk=day_id,
            routine__user=request.user,
        )
        require_active(day.routine)
        if not day.exercises.exists():
            raise ValidationError("Add exercises to this routine day first.")
        if day.exercises.exclude(exercise__category__user=request.user).exists():
            raise ValidationError("This day contains an inaccessible exercise.")
        serializer = CopySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        workout = start_day(day, serializer.validated_data["performed_on"])
        return Response(WorkoutSerializer(workout).data, status=201)


class RoutineExercisesView(APIView):
    permission_classes = [IsAuthenticated]

    @transaction.atomic
    def post(self, request: Request, day_id: str) -> Response:
        User.objects.select_for_update().get(pk=request.user.pk)
        day = get_object_or_404(
            RoutineDay.objects.select_related("routine"),
            pk=day_id,
            routine__user=request.user,
        )
        require_active(day.routine)
        serializer = RoutineExerciseInputSerializer(
            data=request.data, context={"request": request}
        )
        serializer.is_valid(raise_exception=True)
        exercise = serializer.validated_data["exercise"]
        order = (day.exercises.aggregate(value=Max("display_order"))["value"] or 0) + 10
        item = serializer.save(
            day=day,
            exercise_name=exercise.name,
            category_name=exercise.category.name,
            tracking_type=exercise.tracking_type,
            weight_unit=exercise.weight_unit,
            distance_unit=exercise.distance_unit,
            display_order=serializer.validated_data.get("display_order", order),
        )
        return Response(RoutineExerciseSerializer(item).data, status=201)


def owned_item(request: Request, item_id: str) -> RoutineExercise:
    item = get_object_or_404(
        RoutineExercise.objects.select_related("day__routine"),
        pk=item_id,
        day__routine__user=request.user,
        exercise__category__user=request.user,
    )
    require_active(item.day.routine)
    return item


class RoutineExerciseDetailView(APIView):
    permission_classes = [IsAuthenticated]

    @transaction.atomic
    def patch(self, request: Request, item_id: str) -> Response:
        User.objects.select_for_update().get(pk=request.user.pk)
        item = owned_item(request, item_id)
        serializer = ExerciseSettingsSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        for field, value in serializer.validated_data.items():
            setattr(item, field, value)
        item.save(update_fields=list(serializer.validated_data))
        return Response(RoutineExerciseSerializer(item).data)

    @transaction.atomic
    def delete(self, request: Request, item_id: str) -> Response:
        User.objects.select_for_update().get(pk=request.user.pk)
        owned_item(request, item_id).delete()
        return Response(status=204)


class RoutineSetsView(APIView):
    permission_classes = [IsAuthenticated]

    @transaction.atomic
    def post(self, request: Request, item_id: str) -> Response:
        User.objects.select_for_update().get(pk=request.user.pk)
        item = owned_item(request, item_id)
        serializer = RoutineSetInputSerializer(
            data=request.data, context={"routine_exercise": item}
        )
        serializer.is_valid(raise_exception=True)
        order = (item.sets.aggregate(value=Max("display_order"))["value"] or 0) + 10
        serializer.save(
            routine_exercise=item,
            display_order=serializer.validated_data.get("display_order", order),
        )
        return Response(serializer.data, status=201)


def owned_set(request: Request, set_id: str) -> RoutineSet:
    row = get_object_or_404(
        RoutineSet.objects.select_related("routine_exercise__day__routine"),
        pk=set_id,
        routine_exercise__day__routine__user=request.user,
        routine_exercise__exercise__category__user=request.user,
    )
    require_active(row.routine_exercise.day.routine)
    return row


class RoutineSetDetailView(APIView):
    permission_classes = [IsAuthenticated]

    @transaction.atomic
    def patch(self, request: Request, set_id: str) -> Response:
        User.objects.select_for_update().get(pk=request.user.pk)
        row = owned_set(request, set_id)
        serializer = RoutineSetInputSerializer(row, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)

    @transaction.atomic
    def delete(self, request: Request, set_id: str) -> Response:
        User.objects.select_for_update().get(pk=request.user.pk)
        owned_set(request, set_id).delete()
        return Response(status=204)
