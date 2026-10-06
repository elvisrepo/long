import uuid

from django.conf import settings
from django.db import models
from django.db.models import Q


class RecoveryTool(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.CASCADE,
        related_name="recovery_tools",
    )
    slug = models.SlugField(max_length=80, blank=True)
    name = models.CharField(max_length=120)
    description = models.CharField(max_length=500, blank=True)
    display_order = models.PositiveIntegerField(default=100)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["display_order", "name", "id"]
        constraints = [
            models.UniqueConstraint(
                fields=["slug"],
                condition=Q(user__isnull=True),
                name="unique_shared_recovery_slug",
            )
        ]


class RecoveryEntry(models.Model):
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="recovery_entries",
    )
    tool = models.ForeignKey(
        RecoveryTool, on_delete=models.CASCADE, related_name="entries"
    )
    performed_on = models.DateField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["performed_on", "id"]
        constraints = [
            models.UniqueConstraint(
                fields=["user", "tool", "performed_on"],
                name="unique_daily_recovery_entry",
            )
        ]
        indexes = [
            models.Index(fields=["user", "performed_on"], name="recovery_user_day_idx")
        ]
