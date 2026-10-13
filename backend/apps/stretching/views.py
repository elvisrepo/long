from django.db import transaction
from django.shortcuts import get_object_or_404
from rest_framework import serializers
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.users.models import User

from .models import StretchEntry, StretchExercise, StretchPreferences
from .serializers import (
    StretchEntrySerializer,
    StretchExerciseSerializer,
    StretchPreferencesSerializer,
    StretchRangeSerializer,
)


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
        exercises = StretchExercise.objects.filter(is_active=True)
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
        exercise = get_object_or_404(StretchExercise, pk=exercise_id, is_active=True)
        entry, _ = StretchEntry.objects.get_or_create(
            user=request.user, exercise=exercise, performed_on=day
        )
        return Response(StretchEntrySerializer(entry).data)

    @transaction.atomic
    def delete(self, request: Request, exercise_id: str, performed_on: str) -> Response:
        User.objects.select_for_update().get(pk=request.user.pk)
        day = serializers.DateField().run_validation(performed_on)
        get_object_or_404(StretchExercise, pk=exercise_id)
        StretchEntry.objects.filter(
            user=request.user, exercise_id=exercise_id, performed_on=day
        ).delete()
        return Response(status=204)
