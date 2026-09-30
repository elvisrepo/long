from django.http import StreamingHttpResponse
from rest_framework import serializers, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.throttling import UserRateThrottle
from rest_framework.views import APIView

from apps.users.account import account_export, delete_account
from apps.users.views import REFRESH_TOKEN_COOKIE_NAME


class AccountExportThrottle(UserRateThrottle):
    scope = "account_export"
    rate = "3/hour"


class AccountDeleteThrottle(UserRateThrottle):
    scope = "account_delete"
    rate = "5/hour"


class AccountDeleteSerializer(serializers.Serializer):
    password = serializers.CharField(
        write_only=True, trim_whitespace=False, max_length=1024
    )


class AccountDeleteView(APIView):
    permission_classes = [IsAuthenticated]
    throttle_classes = [AccountDeleteThrottle]

    def delete(self, request: Request) -> Response:
        serializer = AccountDeleteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        delete_account(
            user=request.user, password=serializer.validated_data["password"]
        )
        response = Response(status=status.HTTP_204_NO_CONTENT)
        response.delete_cookie(REFRESH_TOKEN_COOKIE_NAME, samesite="Lax")
        response["Cache-Control"] = "no-store"
        return response


class AccountExportView(APIView):
    permission_classes = [IsAuthenticated]
    throttle_classes = [AccountExportThrottle]

    def get(self, request: Request) -> StreamingHttpResponse:
        response = StreamingHttpResponse(
            account_export(request.user),
            content_type="application/json",
        )
        response["Content-Disposition"] = (
            'attachment; filename="longevity-account.json"'
        )
        response["Cache-Control"] = "no-store"
        return response
