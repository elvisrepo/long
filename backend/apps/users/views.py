from rest_framework import status
from rest_framework.decorators import api_view
from rest_framework.response import Response

from apps.users.serializers import LoginSerializer,RegisterSerializer

from django.contrib.auth import authenticate
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.serializers import TokenRefreshSerializer


@api_view(["POST"])
def register_view(request):
      serializer = RegisterSerializer(data=request.data)

      if not serializer.is_valid():
          return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

      user = serializer.save()

      return Response(
          {
              "email": user.email,
          },
          status=status.HTTP_201_CREATED,
      )

@api_view(["POST"])
def login_view(request):
      
      serializer = LoginSerializer(data=request.data)  
      if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

      user = authenticate(**serializer.validated_data)
      if user is None:
          return Response(
              {"detail": "Invalid credentials."},
              status=status.HTTP_400_BAD_REQUEST,
          )

      refresh = RefreshToken.for_user(user)

      return Response(
          {
              "access": str(refresh.access_token),
              "refresh": str(refresh),
          },
          status=status.HTTP_200_OK,
      )

@api_view(["POST"])
def refresh_view(request):
      serializer = TokenRefreshSerializer(data=request.data)
      if not serializer.is_valid():
          return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

      return Response(serializer.validated_data, status=status.HTTP_200_OK)