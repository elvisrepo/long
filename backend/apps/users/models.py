import hmac
import uuid
from functools import lru_cache
from hashlib import sha256
from typing import Any

from cryptography.fernet import Fernet, InvalidToken
from django.conf import settings
from django.contrib.auth.base_user import AbstractBaseUser, BaseUserManager
from django.contrib.auth.models import PermissionsMixin
from django.db import models


def normalize_email(value: str) -> str:
    return value.strip().casefold()


@lru_cache(maxsize=1)
def get_fernet() -> Fernet:
    key = getattr(settings, "PII_ENCRYPTION_KEY", "").strip()
    if not key:
        raise ValueError("PII_ENCRYPTION_KEY must be set.")

    return Fernet(key.encode("utf-8"))


def encrypt_value(value: str) -> str:
    return get_fernet().encrypt(value.encode("utf-8")).decode("utf-8")


def decrypt_value(value: str) -> str:
    try:
        return get_fernet().decrypt(value.encode("utf-8")).decode("utf-8")
    except InvalidToken as exc:
        raise ValueError("Stored encrypted value could not be decrypted.") from exc


def build_email_lookup_hash(email: str) -> str:
    normalized_email = normalize_email(email)
    secret = getattr(settings, "EMAIL_LOOKUP_KEY", "") or settings.SECRET_KEY
    # HMAC gives us a stable keyed value for lookup and uniqueness checks.
    return hmac.new(
        secret.encode("utf-8"),
        normalized_email.encode("utf-8"),
        sha256,
    ).hexdigest()


class EncryptedEmailField(models.EmailField):
    def from_db_value(
        self,
        value: str | None,
        expression: Any,
        connection: Any,
    ) -> str | None:
        if value in {None, ""}:
            return value
        # ORM reads should expose plaintext to app code.
        return decrypt_value(value)

    def get_prep_value(self, value: str | None) -> str | None:
        prepared_value = super().get_prep_value(value)
        if prepared_value in {None, ""}:
            return prepared_value
        # Database writes should store ciphertext, not plaintext.
        return encrypt_value(prepared_value)


class UserManager(BaseUserManager):
    use_in_migrations = True

    def normalize_email(self, email: str) -> str:
        return normalize_email(email)

    def get_by_natural_key(self, username: str) -> "User":
        return self.get(email_lookup_hash=build_email_lookup_hash(username))

    def create_user(
        self,
        email: str,
        password: str | None = None,
        **extra_fields: Any,
    ) -> "User":
        if not email:
            raise ValueError("The email field is required.")

        normalized_email = self.normalize_email(email)
        user = self.model(email=normalized_email, **extra_fields)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_superuser(
        self,
        email: str,
        password: str | None = None,
        **extra_fields: Any,
    ) -> "User":
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
    email: str = EncryptedEmailField()
    email_lookup_hash: str = models.CharField(max_length=64, unique=True, editable=False)
    is_active: bool = models.BooleanField(default=True)
    is_staff: bool = models.BooleanField(default=False)

    objects = UserManager()

    USERNAME_FIELD = "email"
    REQUIRED_FIELDS: list[str] = []

    class Meta:
        db_table = "users_user"

    def save(self, *args: Any, **kwargs: Any) -> None:
        if self.email:
            self.email = normalize_email(self.email)
            # Keep the lookup key aligned even when callers bypass the manager.
            self.email_lookup_hash = build_email_lookup_hash(self.email)
        super().save(*args, **kwargs)

    def __str__(self) -> str:
        return self.email
