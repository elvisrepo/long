from celery import shared_task

'''
- shared_task is the standard Django/Celery pattern for app tasks
  - it allows the task to register with the current Celery app without importing the app directly

'''


@shared_task
def ping():
    return "pong"