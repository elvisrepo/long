import os
from celery import Celery

'''
- .env provides REDIS_URL
  - Django settings read REDIS_URL
  - Django settings define CELERY_BROKER_URL = REDIS_URL
  - Celery loads CELERY_BROKER_URL from Django settings
'''

# which Django settings module to load
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.dev")

app = Celery("config")
app.config_from_object("django.conf:settings", namespace="CELERY")
app.autodiscover_tasks() # future Django apps can expose tasks.py
