from django.conf import settings
from django.core.management import call_command
from rest_framework import status
from rest_framework.decorators import api_view
from rest_framework.request import Request
from rest_framework.response import Response

from apps.metrics.defaults import seed_default_metric_definitions


@api_view(["POST"])
def reset_e2e_database_view(request: Request) -> Response:
    if not getattr(settings, "ENABLE_E2E_TESTING_API", False):
        return Response(status=status.HTTP_404_NOT_FOUND)

    # Flush only the active runtime database; in E2E that is longevity_e2e.
    # Flush removes migration seed rows too, so restore the baseline app data
    # that Playwright expects after each reset.
    call_command("flush", "--no-input", verbosity=0)
    seed_default_metric_definitions()
    return Response(status=status.HTTP_204_NO_CONTENT)
