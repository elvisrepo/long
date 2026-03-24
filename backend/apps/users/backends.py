from django.contrib.auth.backends import BaseBackend
from django.contrib.auth import get_user_model

from apps.users.models import build_email_lookup_hash


class EmailLookupHashBackend(BaseBackend):
      def authenticate(self, request, email=None, password=None, username=None, **kwargs):
          login_value = email or username
          if not login_value or not password:
              return None

          UserModel = get_user_model()

          try:
              user = UserModel.objects.get(
                  email_lookup_hash=build_email_lookup_hash(login_value)
              )
          except UserModel.DoesNotExist:
              return None

          if user.check_password(password) and self.user_can_authenticate(user):
              return user

          return None

      def get_user(self, user_id):
          UserModel = get_user_model()

          try:
              return UserModel.objects.get(pk=user_id)
          except UserModel.DoesNotExist:
              return None

      def user_can_authenticate(self, user):
          return getattr(user, "is_active", True)