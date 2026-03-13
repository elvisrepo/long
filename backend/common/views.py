from django.http import JsonResponse
from common.tasks import ping

def health_view(request):
    return JsonResponse({"status":"ok"})


def ping_task_view(request):
      task = ping.delay()
      return JsonResponse({"task_id": task.id, "task_name": "common.tasks.ping"}, status=202)