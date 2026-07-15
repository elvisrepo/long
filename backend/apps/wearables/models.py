import uuid

from django.conf import settings
from django.db import models


class WearableConnection(models.Model):
    class Provider(models.TextChoices):
        HEALTH_CONNECT = "health_connect", "Health Connect"

    class Status(models.TextChoices):
        CONNECTED = "connected", "Connected"
        DISCONNECTED = "disconnected", "Disconnected"
        ERROR = "error", "Error"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="wearable_connections",
    )
    provider = models.CharField(max_length=32, choices=Provider.choices)
    status = models.CharField(
        max_length=32,
        choices=Status.choices,
        default=Status.DISCONNECTED,
    )
    last_synced_at = models.DateTimeField(null=True, blank=True)
    last_error = models.TextField(blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "wearables_wearable_connection"
        indexes = [
            models.Index(
                fields=["user", "provider", "status"],
                name="wear_conn_user_provider_status",
            ),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=["user", "provider"],
                name="wear_conn_unique_user_provider",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.user_id}:{self.provider}:{self.status}"
