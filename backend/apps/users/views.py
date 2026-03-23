from django.contrib.auth import authenticate
from django.views.decorators.csrf import ensure_csrf_cookie
from rest_framework import status
from rest_framework.authentication import CSRFCheck
from rest_framework.decorators import api_view
from rest_framework.exceptions import PermissionDenied
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.serializers import TokenRefreshSerializer
from rest_framework_simplejwt.tokens import RefreshToken

from apps.users.serializers import LoginSerializer, RegisterSerializer

REFRESH_TOKEN_COOKIE_NAME = "refresh_token"

# run django's csrf checks, if they fail raise a permission error
def enforce_csrf(request: Request) -> None:
      check = CSRFCheck(lambda request: None)
      check.process_request(request)
      reason = check.process_view(request, None, (), {})
      if reason:
          raise PermissionDenied(f"CSRF Failed: {reason}")
      

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
def mobile_logout_view(request: Request) -> Response:
      refresh_token = request.data.get("refresh")
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
def mobile_refresh_view(request: Request) -> Response:
      refresh_token = request.data.get("refresh")
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


    
@ensure_csrf_cookie
@api_view(["GET"])
def csrf_view(request: Request) -> Response:
      return Response(status=status.HTTP_200_OK)


@api_view(["POST"])
def web_refresh_view(request: Request) -> Response:
      refresh_token = request.COOKIES.get(REFRESH_TOKEN_COOKIE_NAME)
      if not refresh_token:
          return Response(
              {"refresh": ["This field is required."]},
              status=status.HTTP_400_BAD_REQUEST,
          )

      enforce_csrf(request)

      try:
          serializer = TokenRefreshSerializer(data={"refresh": refresh_token})
          serializer.is_valid(raise_exception=True)
      except TokenError:
          return Response(
              {"detail": "Token is invalid."},
              status=status.HTTP_401_UNAUTHORIZED,
          )

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



@api_view(["POST"])
def web_logout_view(request: Request) -> Response:
      refresh_token = request.COOKIES.get(REFRESH_TOKEN_COOKIE_NAME)
      if not refresh_token:
          return Response(
              {"refresh": ["This field is required."]},
              status=status.HTTP_400_BAD_REQUEST,
          )

      enforce_csrf(request)

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
