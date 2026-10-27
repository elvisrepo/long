"""Atomic owner-scoped category order updates with optimistic stale protection."""

from django.db import transaction
from rest_framework import serializers
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView
from apps.users.models import User
from .models import ExerciseCategory, WorkoutPreferences
from .views import catalog_response


class CategoryOrderInput(serializers.Serializer):
    mode = serializers.ChoiceField(choices=["alphabetical", "manual"])
    category_ids = serializers.ListField(child=serializers.UUIDField(), max_length=1000)
    expected_order = serializers.ListField(
        child=serializers.UUIDField(), max_length=1000
    )

    def validate(self, data: dict) -> dict:
        if set(self.initial_data) - {"mode", "category_ids", "expected_order"}:
            raise serializers.ValidationError(
                "Only category ordering fields can be supplied."
            )
        for field in ("category_ids", "expected_order"):
            if len(data[field]) != len(set(data[field])):
                raise serializers.ValidationError(
                    {field: "Use each category only once."}
                )
        return data


class CategoryOrderView(APIView):
    permission_classes = [IsAuthenticated]

    @transaction.atomic
    def post(self, request: Request) -> Response:
        User.objects.select_for_update().get(pk=request.user.pk)
        serializer = CategoryOrderInput(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        rows = list(ExerciseCategory.objects.filter(user=request.user))
        current = [row.pk for row in rows]
        if current != data["expected_order"]:
            return Response(
                {
                    "detail": "Categories changed. Close and reopen Reorder categories before saving."
                },
                status=409,
            )
        if set(current) != set(data["category_ids"]):
            raise serializers.ValidationError(
                {
                    "category_ids": "Include every owned category exactly once, including archived categories."
                }
            )
        if data["mode"] == "manual":
            by_id = {row.pk: row for row in rows}
            for n, pk in enumerate(data["category_ids"], start=1):
                by_id[pk].display_order = n * 10
            ExerciseCategory.objects.bulk_update(rows, ["display_order"])
        preferences, _ = WorkoutPreferences.objects.get_or_create(user=request.user)
        preferences.category_order = data["mode"]
        preferences.save(update_fields=["category_order"])
        return catalog_response(request)
