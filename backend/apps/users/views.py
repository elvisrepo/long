from rest_framework import status
from rest_framework.decorators import api_view
from rest_framework.request import Request
from rest_framework.response import Response

from apps.users.serializers import LoginSerializer,RegisterSerializer

from django.contrib.auth import authenticate
from rest_framework_simplejwt.serializers import TokenRefreshSerializer
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.exceptions import TokenError

REFRESH_TOKEN_COOKIE_NAME = "refresh_token"


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

      response = Response(
          {
              "access": str(refresh.access_token),
              "refresh": str(refresh),
          },
          status=status.HTTP_200_OK,
      )

      response.set_cookie(
          key=REFRESH_TOKEN_COOKIE_NAME,
          value=str(refresh),
          httponly=True,
          secure=True,
          samesite="Lax",
      )
      return response

    


@api_view(["GET"])
def me_view(request):
      if not request.user.is_authenticated:
          return Response(
              {"detail": "Authentication credentials were not provided."},
              status=status.HTTP_401_UNAUTHORIZED,
          )

      return Response(
          {
              "email": request.user.email,
          },
          status=status.HTTP_200_OK,
      )

@api_view(["POST"])
def logout_view(request):
      
      refresh_token = request.data.get("refresh") or request.COOKIES.get(
          REFRESH_TOKEN_COOKIE_NAME
      )

      if not refresh_token:
          return Response(
              {"refresh": ["This field is required."]},
              status=status.HTTP_400_BAD_REQUEST,
          )
      
      try:
        token = RefreshToken(refresh_token)
        token.blacklist()

      except TokenError:
        return Response(
              {"refresh": ["Token is invalid."]},
              status=status.HTTP_400_BAD_REQUEST,
          )
      
      response = Response(status=status.HTTP_204_NO_CONTENT)
      response.delete_cookie(
          key=REFRESH_TOKEN_COOKIE_NAME,
          samesite="Lax",
      )
      return response


@api_view(["POST"])
def refresh_view(request: Request) -> Response:
      refresh_token = request.data.get("refresh") or request.COOKIES.get(
          REFRESH_TOKEN_COOKIE_NAME
      )
      if not refresh_token:
          return Response(
              {"refresh": ["This field is required."]},
              status=status.HTTP_400_BAD_REQUEST,
          )

      try:
          serializer = TokenRefreshSerializer(data={"refresh": refresh_token})
          serializer.is_valid(raise_exception=True)
      except TokenError:
          return Response(
              {"detail": "Token is invalid."},
              status=status.HTTP_401_UNAUTHORIZED,
          )
      # because rotation is enabled in SIMPLE_JWT, it generates new refresh/access tokens
      response = Response(serializer.validated_data, status=status.HTTP_200_OK)

      rotated_refresh = serializer.validated_data.get("refresh")
      if rotated_refresh:
          response.set_cookie(
              key=REFRESH_TOKEN_COOKIE_NAME,
              value=rotated_refresh,
              httponly=True,
              secure=True,
              samesite="Lax",
          )

      return response


    
