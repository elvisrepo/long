from django.db import transaction
from django.db.models import Max
from django.shortcuts import get_object_or_404
from rest_framework import serializers
from rest_framework.permissions import IsAuthenticated
from rest_framework.pagination import LimitOffsetPagination
from rest_framework.exceptions import ValidationError
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.users.models import User

from .models import Exercise, ExerciseCategory, Workout, WorkoutExercise, WorkoutSet
from .serializers import (
    CategorySerializer,
    ExerciseSerializer,
    SetSerializer,
    WorkoutExerciseSerializer,
    WorkoutSerializer,
    WorkoutRangeSerializer,
    CopySerializer,
    ExerciseSettingsSerializer,
)
from .services import initialize_catalog, copy_workout


def catalog_response(request: Request) -> Response:
    context = {"request": request}
    search = serializers.CharField(max_length=120, allow_blank=True).run_validation(
        request.query_params.get("search", "")
    )
    exercises = Exercise.objects.filter(category__user=request.user).select_related(
        "category"
    )
    if search:
        exercises = exercises.filter(name__icontains=search)
    return Response(
        {
            "categories": CategorySerializer(
                ExerciseCategory.objects.filter(user=request.user),
                many=True,
                context=context,
            ).data,
            "exercises": ExerciseSerializer(exercises, many=True, context=context).data,
        }
    )


class CatalogView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request: Request) -> Response:
        return catalog_response(request)


class InitializeCatalogView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request: Request) -> Response:
        initialize_catalog(request.user)
        return catalog_response(request)


class ExerciseDetailView(APIView):
    permission_classes = [IsAuthenticated]

    @transaction.atomic
    def patch(self, request: Request, exercise_id: str) -> Response:
        User.objects.select_for_update().get(pk=request.user.pk)
        exercise = get_object_or_404(
            Exercise, pk=exercise_id, category__user=request.user
        )
        serializer = ExerciseSerializer(
            exercise, data=request.data, partial=True, context={"request": request}
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)


class CategoriesView(APIView):
    permission_classes = [IsAuthenticated]

    @transaction.atomic
    def post(self, request: Request) -> Response:
        User.objects.select_for_update().get(pk=request.user.pk)
        serializer = CategorySerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        order = (
            ExerciseCategory.objects.filter(user=request.user).aggregate(
                value=Max("display_order")
            )["value"]
            or 0
        ) + 10
        serializer.save(
            user=request.user,
            is_active=True,
            display_order=serializer.validated_data.get("display_order", order),
        )
        return Response(serializer.data, status=201)


class CategoryDetailView(APIView):
    permission_classes = [IsAuthenticated]

    @transaction.atomic
    def patch(self, request: Request, category_id: str) -> Response:
        User.objects.select_for_update().get(pk=request.user.pk)
        category = get_object_or_404(
            ExerciseCategory, pk=category_id, user=request.user
        )
        serializer = CategorySerializer(
            category, data=request.data, partial=True, context={"request": request}
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)


class ExercisesView(APIView):
    permission_classes = [IsAuthenticated]

    @transaction.atomic
    def post(self, request: Request) -> Response:
        User.objects.select_for_update().get(pk=request.user.pk)
        serializer = ExerciseSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        category = serializer.validated_data["category"]
        order = (
            Exercise.objects.filter(category=category).aggregate(
                value=Max("display_order")
            )["value"]
            or 0
        ) + 10
        serializer.save(
            is_active=True,
            display_order=serializer.validated_data.get("display_order", order),
        )
        return Response(serializer.data, status=201)


class SessionsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request: Request) -> Response:
        dates = WorkoutRangeSerializer(data=request.query_params)
        dates.is_valid(raise_exception=True)
        data = dates.validated_data
        workouts = Workout.objects.filter(
            user=request.user, performed_on__range=(data["date_from"], data["date_to"])
        )
        if exercise_id := data.get("exercise_id"):
            get_object_or_404(Exercise, pk=exercise_id, category__user=request.user)
            workouts = workouts.filter(exercises__exercise_id=exercise_id).distinct()
        paginator = LimitOffsetPagination()
        paginator.default_limit = 25
        paginator.max_limit = 100
        page = paginator.paginate_queryset(
            workouts.prefetch_related("exercises__sets"), request, view=self
        )
        return paginator.get_paginated_response(WorkoutSerializer(page, many=True).data)

    @transaction.atomic
    def post(self, request: Request) -> Response:
        User.objects.select_for_update().get(pk=request.user.pk)
        serializer = WorkoutSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        serializer.save(user=request.user)
        return Response(serializer.data, status=201)


class SessionDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request: Request, workout_id: str) -> Response:
        workout = get_object_or_404(
            Workout.objects.prefetch_related("exercises__sets"),
            pk=workout_id,
            user=request.user,
        )
        return Response(WorkoutSerializer(workout).data)

    @transaction.atomic
    def patch(self, request: Request, workout_id: str) -> Response:
        User.objects.select_for_update().get(pk=request.user.pk)
        workout = get_object_or_404(Workout, pk=workout_id, user=request.user)
        serializer = WorkoutSerializer(
            workout, data=request.data, partial=True, context={"request": request}
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)

    @transaction.atomic
    def delete(self, request: Request, workout_id: str) -> Response:
        User.objects.select_for_update().get(pk=request.user.pk)
        get_object_or_404(Workout, pk=workout_id, user=request.user).delete()
        return Response(status=204)


class SessionExercisesView(APIView):
    permission_classes = [IsAuthenticated]

    @transaction.atomic
    def post(self, request: Request, workout_id: str) -> Response:
        User.objects.select_for_update().get(pk=request.user.pk)
        workout = get_object_or_404(Workout, pk=workout_id, user=request.user)
        require_open(workout)
        serializer = WorkoutExerciseSerializer(
            data=request.data, context={"request": request}
        )
        serializer.is_valid(raise_exception=True)
        exercise = serializer.validated_data["exercise"]
        order = (
            workout.exercises.aggregate(value=Max("display_order"))["value"] or 0
        ) + 10
        serializer.save(
            workout=workout,
            exercise_name=exercise.name,
            category_name=exercise.category.name,
            tracking_type=exercise.tracking_type,
            weight_unit=exercise.weight_unit,
            distance_unit=exercise.distance_unit,
            display_order=serializer.validated_data.get("display_order", order),
        )
        return Response(serializer.data, status=201)


def require_open(workout: Workout) -> None:
    if workout.is_finished:
        raise ValidationError(
            "Reopen the workout before editing its exercises or sets."
        )


class SetsView(APIView):
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
        serializer = SetSerializer(
            data=request.data, context={"workout_exercise": item}
        )
        serializer.is_valid(raise_exception=True)
        order = (item.sets.aggregate(value=Max("display_order"))["value"] or 0) + 10
        serializer.save(
            workout_exercise=item,
            display_order=serializer.validated_data.get("display_order", order),
        )
        return Response(serializer.data, status=201)


class SetDetailView(APIView):
    permission_classes = [IsAuthenticated]

    @transaction.atomic
    def patch(self, request: Request, set_id: str) -> Response:
        User.objects.select_for_update().get(pk=request.user.pk)
        instance = get_object_or_404(
            WorkoutSet.objects.select_related("workout_exercise__workout"),
            pk=set_id,
            workout_exercise__workout__user=request.user,
            workout_exercise__exercise__category__user=request.user,
        )
        require_open(instance.workout_exercise.workout)
        serializer = SetSerializer(instance, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)

    @transaction.atomic
    def delete(self, request: Request, set_id: str) -> Response:
        User.objects.select_for_update().get(pk=request.user.pk)
        instance = get_object_or_404(
            WorkoutSet.objects.select_related("workout_exercise__workout"),
            pk=set_id,
            workout_exercise__workout__user=request.user,
            workout_exercise__exercise__category__user=request.user,
        )
        require_open(instance.workout_exercise.workout)
        instance.delete()
        return Response(status=204)


class CopyView(APIView):
    permission_classes = [IsAuthenticated]

    @transaction.atomic
    def post(self, request: Request, workout_id: str) -> Response:
        User.objects.select_for_update().get(pk=request.user.pk)
        source = get_object_or_404(
            Workout.objects.prefetch_related("exercises__sets", "exercises__exercise"),
            pk=workout_id,
            user=request.user,
        )
        serializer = CopySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        copied = copy_workout(source, serializer.validated_data["performed_on"])
        return Response(WorkoutSerializer(copied).data, status=201)


class SessionExerciseDetailView(APIView):
    permission_classes = [IsAuthenticated]

    @transaction.atomic
    def patch(self, request: Request, item_id: str) -> Response:
        User.objects.select_for_update().get(pk=request.user.pk)
        item = get_object_or_404(
            WorkoutExercise.objects.select_related("workout"),
            pk=item_id,
            workout__user=request.user,
            exercise__category__user=request.user,
        )
        require_open(item.workout)
        serializer = ExerciseSettingsSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        for field, value in serializer.validated_data.items():
            setattr(item, field, value)
        item.save(update_fields=list(serializer.validated_data))
        return Response(WorkoutExerciseSerializer(item).data)

    @transaction.atomic
    def delete(self, request: Request, item_id: str) -> Response:
        User.objects.select_for_update().get(pk=request.user.pk)
        item = get_object_or_404(
            WorkoutExercise.objects.select_related("workout"),
            pk=item_id,
            workout__user=request.user,
            exercise__category__user=request.user,
        )
        require_open(item.workout)
        item.delete()
        return Response(status=204)
