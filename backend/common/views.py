from django.db import DatabaseError, connection
from django.http import HttpRequest, JsonResponse
from django.views.decorators.http import require_GET

from common.tasks import ping


@require_GET
def liveness_view(request: HttpRequest) -> JsonResponse:
    """Report that the Django process can answer an HTTP request."""

    return JsonResponse({"status": "ok"})


@require_GET
def readiness_view(request: HttpRequest) -> JsonResponse:
    """Report that Django can execute a query through its default database."""

    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1")
    except DatabaseError:
        # Health responses are public and must not disclose connection details.
        return JsonResponse({"status": "unavailable"}, status=503)
    return JsonResponse({"status": "ok"})


def ping_task_view(request):
    task = ping.delay()
    return JsonResponse(
        {"task_id": task.id, "task_name": "common.tasks.ping"},
        status=202,
    )
