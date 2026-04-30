import uuid

from django.conf import settings
from django.db import models
from django.db.models import Q


class MetricDefinition(models.Model):
    class Category(models.TextChoices):
        CARDIOVASCULAR = "cardiovascular", "Cardiovascular"
        RESPIRATORY = "respiratory", "Respiratory"
        BODY_COMPOSITION = "body_composition", "Body Composition"
        RECOVERY = "recovery", "Recovery"
        ACTIVITY = "activity", "Activity"
        BIOMARKER = "biomarker", "Biomarker"
        CUSTOM = "custom", "Custom"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.CASCADE,
        related_name="metric_definitions",
    )
    name = models.CharField(max_length=120)
    slug = models.SlugField(max_length=80)
    unit = models.CharField(max_length=32)
    category = models.CharField(max_length=32, choices=Category.choices)
    min_value = models.FloatField()
    max_value = models.FloatField()
    is_default = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)
    metadata = models.JSONField(default=dict, blank=True)

    class Meta:
        db_table = "metrics_metric_definition"
        constraints = [
            models.UniqueConstraint(
                fields=["slug"],
                condition=Q(user__isnull=True),
                name="unique_default_metric_definition_slug",
            ),
            models.UniqueConstraint(
                fields=["user", "slug"],
                condition=Q(user__isnull=False),
                name="unique_user_metric_definition_slug",
            ),
        ]

    def __str__(self) -> str:
        return self.name
