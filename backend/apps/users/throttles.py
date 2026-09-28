from rest_framework.request import Request
from rest_framework.throttling import SimpleRateThrottle


class PasswordResetRequestThrottle(SimpleRateThrottle):
    rate = "3/hour"
    scope = "password_reset_request"

    def get_cache_key(self, request: Request, view: object) -> str:
        return self.cache_format % {
            "scope": self.scope,
            "ident": self.get_ident(request),
        }
