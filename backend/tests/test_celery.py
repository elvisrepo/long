from django.conf import settings
from config.celery import app as celery_app

def test_celery_app_name():
    assert celery_app.main == "config"

def test_celery_uses_redis_as_broker():
    assert celery_app.conf.broker_url == settings.REDIS_URL