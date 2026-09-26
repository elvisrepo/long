from typing import Any, cast

from django.conf import settings
from django.contrib.auth.tokens import default_token_generator
from django.core.mail import send_mail
from django.db import transaction
from django.utils.encoding import force_bytes
from django.utils.http import urlsafe_base64_encode
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.serializers import TokenRefreshSerializer
from rest_framework_simplejwt.settings import api_settings
from rest_framework_simplejwt.token_blacklist.models import (
    BlacklistedToken,
    OutstandingToken,
)
from rest_framework_simplejwt.tokens import RefreshToken, UntypedToken

from apps.subscriptions.models import Subscription, SubscriptionPlan
from apps.users.models import User, build_email_lookup_hash


class PasswordResetEmailDeliveryError(RuntimeError):
    """Hide provider-specific failures behind the password-reset boundary."""

    def __init__(self, provider_error_type: str) -> None:
        super().__init__("Password reset email delivery failed")
        self.provider_error_type = provider_error_type


def send_password_reset_email(*, email: str, reset_url_root: str) -> None:
    user = User.objects.filter(
        email_lookup_hash=build_email_lookup_hash(email),
        is_active=True,
    ).first()
    if user is None or not user.has_usable_password():
        return

    uid = urlsafe_base64_encode(force_bytes(user.pk))
    token = default_token_generator.make_token(user)
    reset_url = f"{reset_url_root}?uid={uid}&token={token}"
    try:
        send_mail(
            subject="Reset your Longevity password",
            message=(
                "Use the link below to reset your Longevity password.\n\n"
                f"{reset_url}\n\n"
                "If you did not request this, you can ignore this email."
            ),
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=[user.email],
        )
    except Exception as exc:
        raise PasswordResetEmailDeliveryError(type(exc).__name__) from None


@transaction.atomic
def reset_user_password(*, user_id: object, token: str, new_password: str) -> bool:
    try:
        user = User.objects.select_for_update().get(pk=user_id, is_active=True)
    except User.DoesNotExist:
        return False

    if not default_token_generator.check_token(user, token):
        return False

    user.set_password(new_password)
    user.save(update_fields=["password"])
    for outstanding_token in OutstandingToken.objects.filter(user=user):
        BlacklistedToken.objects.get_or_create(token=outstanding_token)
    return True


def _validated_refresh_jti(refresh_token: str) -> str:
    """Validate signed token claims without performing the blacklist check yet."""
    # SimpleJWT 5.5.1 accepts a raw JWT string at runtime, but its annotation
    # resolves `Token` to the token class and incorrectly rejects `str` in MyPy.
    token = UntypedToken(cast(Any, refresh_token))
    if token.payload.get(api_settings.TOKEN_TYPE_CLAIM) != RefreshToken.token_type:
        raise TokenError("Token has wrong type.")

    jti = token.payload.get(api_settings.JTI_CLAIM)
    if not isinstance(jti, str) or not jti:
        raise TokenError("Token has no id.")

    return jti


@transaction.atomic
def rotate_refresh_token(*, refresh_token: str) -> dict[str, str]:
    """Rotate one outstanding refresh token at a time across all clients."""
    jti = _validated_refresh_jti(refresh_token)

    try:
        # The stable outstanding row exists for the lifetime of this token and
        # provides a PostgreSQL lock shared by web and mobile refresh requests.
        OutstandingToken.objects.select_for_update().get(jti=jti)
    except OutstandingToken.DoesNotExist as exc:
        raise TokenError("Token is not outstanding.") from exc

    # Constructing RefreshToken inside serializer validation now performs its
    # blacklist check while the per-token row lock is held. A waiting request
    # sees the first request's committed blacklist entry and is rejected.
    serializer = TokenRefreshSerializer(data={"refresh": refresh_token})
    serializer.is_valid(raise_exception=True)
    return dict(serializer.validated_data)

@transaction.atomic
def create_user_with_subscription(*, email: str, password: str) -> User:
    free_plan = SubscriptionPlan.objects.get(
          code="free",
          is_active=True,
          is_default=True,
      )
    
    user = User.objects.create_user(
          email=email,
          password=password,
      )

    Subscription.objects.create(
          user=user,
          plan=free_plan,
          status=Subscription.Status.ACTIVE,
      )

    return user
