import uuid

from django.conf import settings
from django.db import models
from django.db.models import Q


class StretchExercise(models.Model):
    class Phase(models.TextChoices):
        LOWER_BODY = "lower-body", "Lower body & hips"
        UPPER_BODY = "upper-body", "Upper body & posture"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    slug = models.SlugField(max_length=80, blank=True)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.CASCADE,
        related_name="custom_stretch_exercises",
    )
    phase = models.CharField(max_length=20, choices=Phase.choices)
    name = models.CharField(max_length=120)
    description = models.CharField(max_length=500, blank=True)
    dosage = models.CharField(max_length=120, blank=True)
    display_order = models.PositiveIntegerField(default=100)
    is_active = models.BooleanField(default=True)
    image_key = models.CharField(max_length=500, blank=True)

    class Meta:
        ordering = ["phase", "display_order", "name", "id"]
        constraints = [
            models.UniqueConstraint(
                fields=["slug"],
                condition=Q(user__isnull=True),
                name="unique_shared_stretch_slug",
            )
        ]


class StretchImageCleanup(models.Model):
    object_key = models.CharField(max_length=500, unique=True)
    queued_at = models.DateTimeField(auto_now_add=True)
    attempt_count = models.PositiveIntegerField(default=0)
    last_attempt_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["queued_at", "id"]


class StretchPreferences(models.Model):
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        primary_key=True,
        on_delete=models.CASCADE,
        related_name="stretching_preferences",
    )
    show_shared_exercises = models.BooleanField(default=True)
    hidden_exercises = models.ManyToManyField(
        StretchExercise, related_name="hidden_for_users", blank=True
    )


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
