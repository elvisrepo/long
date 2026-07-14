"""
Base Django settings shared across environments.
"""

import os
from pathlib import Path

import dj_database_url
from dotenv import load_dotenv

from datetime import timedelta


BASE_DIR = Path(__file__).resolve().parent.parent.parent  #points to backend
ENV_FILE = BASE_DIR / ".env"
DEFAULT_DATABASE_URL = f"sqlite:///{(BASE_DIR / 'db.sqlite3').as_posix()}"

load_dotenv(ENV_FILE)

SECRET_KEY = os.environ.get("SECRET_KEY", "dev-only-insecure-secret-key")
PII_ENCRYPTION_KEY = os.environ.get("PII_ENCRYPTION_KEY", "").strip()
EMAIL_LOOKUP_KEY = os.environ.get("EMAIL_LOOKUP_KEY", "").strip()

DEBUG = os.environ.get("DEBUG", "False").strip().lower() in {"1", "true", "yes", "on"}

ALLOWED_HOSTS = [
      host.strip()
      for host in os.environ.get("ALLOWED_HOSTS", "").split(",")
      if host.strip()
  ]

CSRF_TRUSTED_ORIGINS = [
      origin.strip()
      for origin in os.environ.get("CSRF_TRUSTED_ORIGINS", "").split(",")
      if origin.strip()
  ]

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "apps.users",
    "apps.metrics",
    "apps.subscriptions",
    "apps.wearables",
    "common",
    "rest_framework_simplejwt.token_blacklist",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "config.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "config.wsgi.application"
ASGI_APPLICATION = "config.asgi.application"

DATABASES = {
    "default": dj_database_url.config(
        default=DEFAULT_DATABASE_URL,
        conn_max_age=60,
    )
}
REDIS_URL = os.environ.get("REDIS_URL", "redis://127.0.0.1:6379/0")
CELERY_BROKER_URL = REDIS_URL

STRIPE_SECRET_KEY = os.environ.get("STRIPE_SECRET_KEY", "").strip()
STRIPE_WEBHOOK_SECRET = os.environ.get("STRIPE_WEBHOOK_SECRET", "").strip()
STRIPE_CHECKOUT_SUCCESS_URL = os.environ.get(
      "STRIPE_CHECKOUT_SUCCESS_URL",
      "http://localhost:5173/settings?checkout=success",
  ).strip()
STRIPE_CHECKOUT_CANCEL_URL = os.environ.get(
      "STRIPE_CHECKOUT_CANCEL_URL",
      "http://localhost:5173/settings?checkout=cancelled",
  ).strip()
STRIPE_CUSTOMER_PORTAL_RETURN_URL = os.environ.get(
    "STRIPE_CUSTOMER_PORTAL_RETURN_URL",
    "http://localhost:5173/settings",
).strip()

AUTH_PASSWORD_VALIDATORS = [
    {
        "NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator",
    },
    {
        "NAME": "django.contrib.auth.password_validation.MinimumLengthValidator",
    },
    {
        "NAME": "django.contrib.auth.password_validation.CommonPasswordValidator",
    },
    {
        "NAME": "django.contrib.auth.password_validation.NumericPasswordValidator",
    },
]

AUTH_USER_MODEL = "users.User"

AUTHENTICATION_BACKENDS = [
      "apps.users.backends.EmailLookupHashBackend",
  ]

LANGUAGE_CODE = "en-us"

TIME_ZONE = "UTC"

USE_I18N = True

USE_TZ = True

STATIC_URL = "static/"

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

REST_FRAMEWORK = {
      "DEFAULT_AUTHENTICATION_CLASSES": (
          "rest_framework_simplejwt.authentication.JWTAuthentication",
      ),
  }

SIMPLE_JWT = {
      "ACCESS_TOKEN_LIFETIME": timedelta(minutes=15),
      "REFRESH_TOKEN_LIFETIME": timedelta(days=7),
      "ROTATE_REFRESH_TOKENS": True,
      "BLACKLIST_AFTER_ROTATION": True,
      "SIGNING_KEY": os.environ.get("JWT_SIGNING_KEY", default=SECRET_KEY),
  }


LOG_LEVEL = os.environ.get("LOG_LEVEL", "INFO").upper()
DJANGO_LOG_LEVEL = os.environ.get("DJANGO_LOG_LEVEL", "INFO").upper()

LOGGING = {
      "version": 1,
      "disable_existing_loggers": False,
      "formatters": {
          "standard": {
              "format": "{asctime} {levelname} {name} {message}",
              "style": "{",
          },
      },
      "handlers": {
          "console": {
              "class": "logging.StreamHandler",
              "formatter": "standard",
          },
      },
      "root": {
          "handlers": ["console"],
          "level": LOG_LEVEL,
      },
      "loggers": {
          "django": {
              "handlers": ["console"],
              "level": LOG_LEVEL,
              "propagate": False,
          },
          "apps.users": {
              "handlers": ["console"],
              "level": LOG_LEVEL,
              "propagate": False,
          },
      },
  }
