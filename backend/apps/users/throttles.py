from rest_framework.request import Request
from rest_framework.throttling import SimpleRateThrottle

from apps.users.models import build_email_lookup_hash


class IdentityRateThrottle(SimpleRateThrottle):
    """Rate-limit a submitted identity without putting it in the cache key."""

    identity_field = "email"

    def get_cache_key(self, request: Request, view: object) -> str | None:
        value = (
            request.data.get(self.identity_field)
            if isinstance(request.data, dict)
            else None
        )
        if isinstance(value, str) and value.strip():
            identity = build_email_lookup_hash(value)
        else:
            # Still limit malformed/empty requests by caller address.
            identity = self.get_ident(request)
        return self.cache_format % {
            "scope": self.scope,
            "ident": identity,
        }


class LoginThrottle(IdentityRateThrottle):
    rate = "5/minute"
    scope = "auth_login"


class RegistrationThrottle(IdentityRateThrottle):
    rate = "5/hour"
    scope = "auth_registration"


class RegistrationIPThrottle(SimpleRateThrottle):
    rate = "10/hour"
    scope = "auth_registration_ip"

    def get_cache_key(self, request: Request, view: object) -> str:
        return self.cache_format % {
            "scope": self.scope,
            "ident": self.get_ident(request),
        }


class PasswordResetEmailThrottle(IdentityRateThrottle):
    rate = "3/hour"
    scope = "password_reset_email"


class PasswordResetConfirmThrottle(IdentityRateThrottle):
    rate = "10/hour"
    scope = "password_reset_confirm"
    identity_field = "uid"


class PasswordResetRequestThrottle(SimpleRateThrottle):
    rate = "3/hour"
    scope = "password_reset_request"

    def get_cache_key(self, request: Request, view: object) -> str:
        return self.cache_format % {
            "scope": self.scope,
            "ident": self.get_ident(request),
        }
