import uuid

from django.conf import settings
from django.db import models


class StretchExercise(models.Model):
    class Phase(models.TextChoices):
        LOWER_BODY = "lower-body", "Lower body & hips"
        UPPER_BODY = "upper-body", "Upper body & posture"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    slug = models.SlugField(max_length=80, unique=True)
    phase = models.CharField(max_length=20, choices=Phase.choices)
    name = models.CharField(max_length=120)
    description = models.CharField(max_length=500, blank=True)
    dosage = models.CharField(max_length=120, blank=True)
    display_order = models.PositiveIntegerField(default=100)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["phase", "display_order", "name", "id"]


class StretchEntry(models.Model):
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="stretching_entries",
    )
    exercise = models.ForeignKey(
        StretchExercise, on_delete=models.CASCADE, related_name="entries"
    )
    performed_on = models.DateField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["performed_on", "id"]
        constraints = [
            models.UniqueConstraint(
                fields=["user", "exercise", "performed_on"],
                name="unique_daily_stretch_entry",
            )
        ]
        indexes = [
            models.Index(fields=["user", "performed_on"], name="stretch_user_day_idx")
        ]
