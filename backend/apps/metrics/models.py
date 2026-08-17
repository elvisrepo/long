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


class MetricEntry(models.Model):
    class Source(models.TextChoices):
        MANUAL = "manual", "Manual"
        SAMSUNG_HEALTH = "samsung_health", "Samsung Health"
        GARMIN = "garmin", "Garmin"
        FITBIT = "fitbit", "Fitbit"
        OURA = "oura", "Oura"
        WITHINGS = "withings", "Withings"
        CSV_IMPORT = "csv_import", "CSV Import"

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="metric_entries",
    )
    metric_definition = models.ForeignKey(
        MetricDefinition,
        on_delete=models.PROTECT,
        related_name="entries",
    )
    value = models.FloatField()
    # Null for instantaneous measurements. Interval metrics such as Steps use
    # recorded_at as the interval end and retain their beginning here.
    period_start = models.DateTimeField(null=True, blank=True)
    recorded_at = models.DateTimeField()
    source = models.CharField(
        max_length=32,
        choices=Source.choices,
        default=Source.MANUAL,
    )
    # Null for manual entries; wearable entries retain their connection source.
    source_connection = models.ForeignKey(
        "wearables.WearableConnection",
        null=True,
        blank=True,
        on_delete=models.RESTRICT,
        related_name="metric_entries",
    )
    external_source_id = models.CharField(max_length=255, null=True, blank=True)
    context = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "metrics_metric_entry"
        constraints = [
            models.CheckConstraint(
                condition=(
                    Q(period_start__isnull=True)
                    | Q(period_start__lt=models.F("recorded_at"))
                ),
                name="metrics_valid_entry_period",
            ),
            models.UniqueConstraint(
                fields=["source_connection", "external_source_id"],
                condition=Q(external_source_id__isnull=False),
                name="metrics_unique_source_record",
            ),
        ]
        indexes = [
            # Primary read path: a user's timeline, newest measurements first.
            models.Index(
                fields=["user", "-recorded_at", "-id"],
                name="metrics_met_user_id_dbaeb1_idx",
            ),
            models.Index(
                fields=["user", "metric_definition", "-recorded_at"],
                name="metrics_met_user_id_a16cca_idx",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.metric_definition.slug}: {self.value}"

    @property
    def is_user_editable(self) -> bool:
        """Return whether this entry was created manually by the user."""
        return (
            self.source == self.Source.MANUAL
            and self.source_connection_id is None
            and self.external_source_id is None
        )
