from django.apps import AppConfig


class StretchingConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.stretching"

    def ready(self) -> None:
        from . import signals  # noqa: F401
