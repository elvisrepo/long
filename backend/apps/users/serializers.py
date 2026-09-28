from django.contrib.auth import get_user_model
from django.contrib.auth.tokens import default_token_generator
from django.core.exceptions import ValidationError as DjangoValidationError
from django.contrib.auth.password_validation import validate_password
from django.core.validators import validate_email
from django.utils.encoding import force_str
from django.utils.http import urlsafe_base64_decode
from rest_framework import serializers
from apps.users.services import create_user_with_subscription

from apps.users.models import User, build_email_lookup_hash


class RegisterSerializer(serializers.Serializer):
      email = serializers.CharField(required=True)
      password = serializers.CharField(required=True, write_only=True)


      def validate_email(self, value):
          validate_email(value)

          if get_user_model().objects.filter(
              email_lookup_hash=build_email_lookup_hash(value)
          ).exists():
              raise serializers.ValidationError(
                  "A user with that email already exists."
              )

          return value

      def validate_password(self, value):
          validate_password(value)
          return value

      def create(self, validated_data: dict[str, str]) -> User:
        return create_user_with_subscription(**validated_data)
      
class LoginSerializer(serializers.Serializer):
      email = serializers.CharField(required=True)
      password = serializers.CharField(required=True, write_only=True)


class PasswordResetRequestSerializer(serializers.Serializer):
    email = serializers.EmailField(required=True)


class PasswordResetConfirmSerializer(serializers.Serializer):
    uid = serializers.CharField(required=True, write_only=True)
    token = serializers.CharField(required=True, write_only=True)
    new_password = serializers.CharField(required=True, write_only=True)

    def validate(self, attrs: dict[str, object]) -> dict[str, object]:
        uid = str(attrs["uid"])
        token = str(attrs["token"])
        new_password = str(attrs["new_password"])
        try:
            user_id = force_str(urlsafe_base64_decode(uid))
            user = User.objects.get(pk=user_id, is_active=True)
        except (DjangoValidationError, TypeError, ValueError, User.DoesNotExist):
            raise serializers.ValidationError(
                {"token": ["Reset link is invalid or expired."]}
            ) from None

        if not default_token_generator.check_token(user, token):
            raise serializers.ValidationError(
                {"token": ["Reset link is invalid or expired."]}
            )

        try:
            validate_password(new_password, user=user)
        except DjangoValidationError as exc:
            raise serializers.ValidationError({"new_password": exc.messages}) from exc

        attrs["user_id"] = user.pk
        return attrs
