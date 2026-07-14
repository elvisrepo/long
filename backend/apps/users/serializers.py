from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from django.core.validators import validate_email
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
