from django.db import transaction
from django.db.models import Max
from django.shortcuts import get_object_or_404
from rest_framework import serializers
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.users.models import User

from .models import DietEntry, DietFood, DietSection
from .serializers import (
    DietEntrySerializer,
    DietFoodSerializer,
    DietRangeSerializer,
    DietSectionSerializer,
)


class DietCatalogView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request: Request) -> Response:
        return Response(
            {
                "sections": DietSectionSerializer(
                    DietSection.objects.filter(user=request.user), many=True
                ).data,
                "foods": DietFoodSerializer(
                    DietFood.objects.filter(section__user=request.user),
                    many=True,
                    context={"request": request},
                ).data,
            }
        )


class DietSectionsView(APIView):
    permission_classes = [IsAuthenticated]

    @transaction.atomic
    def post(self, request: Request) -> Response:
        User.objects.select_for_update().get(pk=request.user.pk)
        serializer = DietSectionSerializer(
            data=request.data, context={"request": request}
        )
        serializer.is_valid(raise_exception=True)
        order = serializer.validated_data.get(
            "display_order",
            (
                DietSection.objects.filter(user=request.user).aggregate(
                    value=Max("display_order")
                )["value"]
                or 0
            )
            + 10,
        )
        serializer.save(user=request.user, is_active=True, display_order=order)
        return Response(serializer.data, status=201)


class DietSectionDetailView(APIView):
    permission_classes = [IsAuthenticated]

    @transaction.atomic
    def patch(self, request: Request, section_id: str) -> Response:
        User.objects.select_for_update().get(pk=request.user.pk)
        section = get_object_or_404(DietSection, pk=section_id, user=request.user)
        serializer = DietSectionSerializer(
            section, data=request.data, partial=True, context={"request": request}
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)


class DietFoodsView(APIView):
    permission_classes = [IsAuthenticated]

    @transaction.atomic
    def post(self, request: Request) -> Response:
        User.objects.select_for_update().get(pk=request.user.pk)
        serializer = DietFoodSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        section = serializer.validated_data["section"]
        order = serializer.validated_data.get(
            "display_order",
            (
                DietFood.objects.filter(section=section).aggregate(
                    value=Max("display_order")
                )["value"]
                or 0
            )
            + 10,
        )
        serializer.save(is_active=True, display_order=order)
        return Response(serializer.data, status=201)


class DietFoodDetailView(APIView):
    permission_classes = [IsAuthenticated]

    @transaction.atomic
    def patch(self, request: Request, food_id: str) -> Response:
        User.objects.select_for_update().get(pk=request.user.pk)
        food = get_object_or_404(DietFood, pk=food_id, section__user=request.user)
        serializer = DietFoodSerializer(
            food, data=request.data, partial=True, context={"request": request}
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)


class DietEntriesView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request: Request) -> Response:
        dates = DietRangeSerializer(data=request.query_params)
        dates.is_valid(raise_exception=True)
        entries = DietEntry.objects.filter(
            user=request.user,
            food__section__user=request.user,
            performed_on__range=(
                dates.validated_data["date_from"],
                dates.validated_data["date_to"],
            ),
        )
        return Response(DietEntrySerializer(entries, many=True).data)


class DietCheckoffView(APIView):
    permission_classes = [IsAuthenticated]

    @transaction.atomic
    def put(self, request: Request, food_id: str, performed_on: str) -> Response:
        User.objects.select_for_update().get(pk=request.user.pk)
        day = serializers.DateField().run_validation(performed_on)
        food = get_object_or_404(
            DietFood.objects.select_related("section"),
            pk=food_id,
            section__user=request.user,
        )
        if not food.is_active or not food.section.is_active:
            raise ValidationError(
                "Restore the food and its section before tracking it."
            )
        entry, _ = DietEntry.objects.get_or_create(
            user=request.user, food=food, performed_on=day
        )
        return Response(DietEntrySerializer(entry).data)

    @transaction.atomic
    def delete(self, request: Request, food_id: str, performed_on: str) -> Response:
        User.objects.select_for_update().get(pk=request.user.pk)
        day = serializers.DateField().run_validation(performed_on)
        get_object_or_404(DietFood, pk=food_id, section__user=request.user)
        DietEntry.objects.filter(
            user=request.user, food_id=food_id, performed_on=day
        ).delete()
        return Response(status=204)
