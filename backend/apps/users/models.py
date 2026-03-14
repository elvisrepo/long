import hashlib
import uuid

from django.contrib.auth.base_user import AbstractBaseUser, BaseUserManager
from django.contrib.auth.models import PermissionsMixin
from django.db import models

def normalize_email(value:str) -> str:
    return value.strip().casefold()

def build_email_lookup_hash(email: str) -> str:
    normalized_email = normalize_email(email)
    return hashlib.sha256(normalized_email.encode("utf-8")).hexdigest()

class UserManager(BaseUserManager):
      use_in_migrations = True

      def create_user(self, email: str, password: str | None = None, **extra_fields):
          if not email:
              raise ValueError("The email field is required.")

          normalized_email = normalize_email(email)
          user = self.model(
              email=normalized_email,
              email_lookup_hash=build_email_lookup_hash(normalized_email),
              **extra_fields,
          )
          user.set_password(password)
          user.save(using=self._db)
          return user

      def create_superuser(self, email: str, password: str | None = None, **extra_fields):
          extra_fields.setdefault("is_staff", True)
          extra_fields.setdefault("is_superuser", True)
          extra_fields.setdefault("is_active", True)

          if extra_fields["is_staff"] is not True:
              raise ValueError("Superuser must have is_staff=True.")
          if extra_fields["is_superuser"] is not True:
              raise ValueError("Superuser must have is_superuser=True.")

          return self.create_user(email=email, password=password, **extra_fields)


class User(AbstractBaseUser, PermissionsMixin):
      id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
      email = models.EmailField(unique=True)
      email_lookup_hash = models.CharField(max_length=64, unique=True, editable=False)
      is_active = models.BooleanField(default=True)
      is_staff = models.BooleanField(default=False)

      objects = UserManager()

      USERNAME_FIELD = "email"
      REQUIRED_FIELDS = []

      class Meta:
          db_table = "users_user"

      def __str__(self) -> str:
          return self.email