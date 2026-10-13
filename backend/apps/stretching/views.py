from django.db import transaction
from django.db.models import Q
from django.http import FileResponse
from django.shortcuts import get_object_or_404
from rest_framework import serializers, status
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.exceptions import APIException, NotFound
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.users.models import User

from .models import StretchEntry, StretchExercise, StretchPreferences
from .serializers import (
    CustomStretchExerciseSerializer,
    StretchEntrySerializer,
    StretchExerciseSerializer,
    StretchPreferencesSerializer,
    StretchRangeSerializer,
)
from .storage import (
    ImageStorageUnavailable,
    delete_stretch_image,
    open_stretch_image,
    save_stretch_image,
)


class StretchImageStorageUnavailable(APIException):
    status_code = status.HTTP_503_SERVICE_UNAVAILABLE
    default_detail = "Image storage is not configured or is temporarily unavailable."


class StretchExercisesView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request: Request) -> Response:
        preferences = StretchPreferences.objects.filter(user=request.user).first()
        show_shared_exercises = (
            preferences.show_shared_exercises if preferences is not None else True
        )
        hidden_exercise_ids = (
            {
                str(value)
                for value in preferences.hidden_exercises.values_list("id", flat=True)
            }
            if preferences is not None
            else set()
        )
        context = {
            "show_shared_exercises": show_shared_exercises,
            "hidden_exercise_ids": hidden_exercise_ids,
        }
        exercises = StretchExercise.objects.filter(
            Q(user__isnull=True, is_active=True) | Q(user=request.user)
        )
        phases = []
        for phase, label in StretchExercise.Phase.choices:
            phase_exercises = exercises.filter(phase=phase)
            phases.append(
                {
                    "slug": phase,
                    "name": label,
                    "exercises": StretchExerciseSerializer(
                        phase_exercises, many=True, context=context
                    ).data,
                }
            )
        return Response({"phases": phases})

    def post(self, request: Request) -> Response:
        serializer = CustomStretchExerciseSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        image = serializer.validated_data.pop("image", None)
        serializer.validated_data.pop("remove_image", None)
        new_image_key = ""
        try:
            with transaction.atomic():
                user = get_object_or_404(
                    User.objects.select_for_update(), pk=request.user.pk
                )
                exercise = serializer.save(user=user, slug="", display_order=100)
                if image is not None:
                    try:
                        new_image_key = save_stretch_image(image, user.pk, exercise.pk)
                        exercise.image_key = new_image_key
                        exercise.save(update_fields=["image_key"])
                    except ImageStorageUnavailable as exc:
                        raise StretchImageStorageUnavailable(str(exc)) from exc
                    except ValueError as exc:
                        raise serializers.ValidationError({"image": str(exc)}) from exc
        except Exception:
            if new_image_key:
                delete_stretch_image(new_image_key)
            raise
        return Response(
            StretchExerciseSerializer(
                exercise, context=self._catalog_context(request)
            ).data,
            status=status.HTTP_201_CREATED,
        )

    @staticmethod
    def _catalog_context(request: Request) -> dict[str, object]:
        preferences = StretchPreferences.objects.filter(user=request.user).first()
        hidden = (
            {
                str(value)
                for value in preferences.hidden_exercises.values_list("id", flat=True)
            }
            if preferences is not None
            else set()
        )
        return {
            "show_shared_exercises": (
                preferences.show_shared_exercises if preferences is not None else True
            ),
            "hidden_exercise_ids": hidden,
        }


class CustomStretchExerciseDetailView(APIView):
    permission_classes = [IsAuthenticated]
    parser_classes = [JSONParser, FormParser, MultiPartParser]

    def patch(self, request: Request, exercise_id: str) -> Response:
        exercise = get_object_or_404(StretchExercise, pk=exercise_id, user=request.user)
        serializer = CustomStretchExerciseSerializer(
            exercise, data=request.data, partial=True
        )
        serializer.is_valid(raise_exception=True)
        image = serializer.validated_data.pop("image", None)
        remove_image = serializer.validated_data.pop("remove_image", False)
        new_image_key = ""
        if image is not None:
            try:
                new_image_key = save_stretch_image(image, request.user.pk, exercise.pk)
            except ImageStorageUnavailable as exc:
                raise StretchImageStorageUnavailable(str(exc)) from exc
            except ValueError as exc:
                raise serializers.ValidationError({"image": str(exc)}) from exc

        try:
            with transaction.atomic():
                get_object_or_404(User.objects.select_for_update(), pk=request.user.pk)
                exercise = get_object_or_404(
                    StretchExercise.objects.select_for_update(),
                    pk=exercise_id,
                    user=request.user,
                )
                serializer.instance = exercise
                exercise = serializer.save()
                if image is not None or remove_image:
                    old_image_key = exercise.image_key
                    exercise.image_key = new_image_key if image is not None else ""
                    exercise.save(update_fields=["image_key"])
                    if old_image_key:
                        delete_stretch_image(old_image_key)
        except Exception:
            if new_image_key:
                delete_stretch_image(new_image_key)
            raise
        return Response(
            StretchExerciseSerializer(
                exercise, context=StretchExercisesView._catalog_context(request)
            ).data
        )

    def delete(self, request: Request, exercise_id: str) -> Response:
        with transaction.atomic():
            get_object_or_404(User.objects.select_for_update(), pk=request.user.pk)
            exercise = get_object_or_404(
                StretchExercise.objects.select_for_update(),
                pk=exercise_id,
                user=request.user,
            )
            exercise.is_active = False
            exercise.save(update_fields=["is_active"])
        return Response(status=status.HTTP_204_NO_CONTENT)


class CustomStretchExerciseImageView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request: Request, exercise_id: str) -> FileResponse:
        exercise = get_object_or_404(StretchExercise, pk=exercise_id, user=request.user)
        if not exercise.image_key:
            raise NotFound("This stretch has no image.")
        try:
            image = open_stretch_image(exercise.image_key)
        except ImageStorageUnavailable as exc:
            raise StretchImageStorageUnavailable(str(exc)) from exc
        response = FileResponse(image, content_type="image/webp")
        response["Cache-Control"] = "private, no-store"
        response["X-Content-Type-Options"] = "nosniff"
        return response


class StretchPreferencesView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request: Request) -> Response:
        preferences = StretchPreferences.objects.filter(user=request.user).first()
        return Response(self._data(preferences))

    @transaction.atomic
    def patch(self, request: Request) -> Response:
        User.objects.select_for_update().get(pk=request.user.pk)
        preferences, _ = StretchPreferences.objects.get_or_create(user=request.user)
        serializer = StretchPreferencesSerializer(data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        if "show_shared_exercises" in serializer.validated_data:
            preferences.show_shared_exercises = serializer.validated_data[
                "show_shared_exercises"
            ]
            preferences.save(update_fields=["show_shared_exercises"])
        if "hidden_exercise_ids" in serializer.validated_data:
            preferences.hidden_exercises.set(
                serializer.validated_data["hidden_exercise_ids"]
            )
        return Response(self._data(preferences))

    @staticmethod
    def _data(preferences: StretchPreferences | None) -> dict[str, object]:
        return {
            "show_shared_exercises": (
                preferences.show_shared_exercises if preferences is not None else True
            ),
            "hidden_exercise_ids": (
                sorted(
                    str(value)
                    for value in preferences.hidden_exercises.values_list(
                        "id", flat=True
                    )
                )
                if preferences is not None
                else []
            ),
        }


class StretchEntriesView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request: Request) -> Response:
        dates = StretchRangeSerializer(data=request.query_params)
        dates.is_valid(raise_exception=True)
        entries = StretchEntry.objects.filter(
            user=request.user,
            performed_on__range=(
                dates.validated_data["date_from"],
                dates.validated_data["date_to"],
            ),
        )
        return Response(StretchEntrySerializer(entries, many=True).data)


class StretchCheckoffView(APIView):
    permission_classes = [IsAuthenticated]

    @transaction.atomic
    def put(self, request: Request, exercise_id: str, performed_on: str) -> Response:
        User.objects.select_for_update().get(pk=request.user.pk)
        day = serializers.DateField().run_validation(performed_on)
        exercise = get_object_or_404(
            StretchExercise.objects.filter(is_active=True).filter(
                Q(user__isnull=True) | Q(user=request.user)
            ),
            pk=exercise_id,
        )
        entry, _ = StretchEntry.objects.get_or_create(
            user=request.user, exercise=exercise, performed_on=day
        )
        return Response(StretchEntrySerializer(entry).data)

    @transaction.atomic
    def delete(self, request: Request, exercise_id: str, performed_on: str) -> Response:
        User.objects.select_for_update().get(pk=request.user.pk)
        day = serializers.DateField().run_validation(performed_on)
        get_object_or_404(
            StretchExercise.objects.filter(Q(user__isnull=True) | Q(user=request.user)),
            pk=exercise_id,
        )
        StretchEntry.objects.filter(
            user=request.user, exercise_id=exercise_id, performed_on=day
        ).delete()
        return Response(status=204)
