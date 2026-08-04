from typing import Any, cast

from django.db import transaction
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.serializers import TokenRefreshSerializer
from rest_framework_simplejwt.settings import api_settings
from rest_framework_simplejwt.token_blacklist.models import OutstandingToken
from rest_framework_simplejwt.tokens import RefreshToken, UntypedToken

from apps.subscriptions.models import Subscription, SubscriptionPlan
from apps.users.models import User


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
