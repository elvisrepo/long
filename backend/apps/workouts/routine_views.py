from django.db import transaction
from django.db.models import Max
from django.shortcuts import get_object_or_404
from rest_framework.permissions import IsAuthenticated
from rest_framework.exceptions import ValidationError
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView
from apps.users.models import User
from .models import WorkoutRoutine, RoutineDay
from .routine_serializers import RoutineSerializer, RoutineDaySerializer
from .routine_services import capture_day, start_day
from .serializers import CopySerializer, WorkoutSerializer


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
        source = serializer.validated_data.pop("source_workout")
        order = (routine.days.aggregate(value=Max("display_order"))["value"] or 0) + 10
        day = serializer.save(
            routine=routine,
            display_order=serializer.validated_data.get("display_order", order),
        )
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
