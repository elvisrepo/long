import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ("metrics", "0001_initial"),
    ]

    operations = [
        migrations.CreateModel(
            name="MetricEntry",
            fields=[
                (
                    "id",
                    models.BigAutoField(
                        auto_created=True,
                        primary_key=True,
                        serialize=False,
                        verbose_name="ID",
                    ),
                ),
                ("value", models.FloatField()),
                ("recorded_at", models.DateTimeField()),
                (
                    "source",
                    models.CharField(
                        choices=[
                            ("manual", "Manual"),
                            ("samsung_health", "Samsung Health"),
                            ("garmin", "Garmin"),
                            ("fitbit", "Fitbit"),
                            ("oura", "Oura"),
                            ("withings", "Withings"),
                            ("csv_import", "CSV Import"),
                        ],
                        default="manual",
                        max_length=32,
                    ),
                ),
                ("source_connection_id", models.UUIDField(blank=True, null=True)),
                (
                    "external_source_id",
                    models.CharField(blank=True, max_length=255, null=True),
                ),
                ("context", models.JSONField(blank=True, default=dict)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                (
                    "metric_definition",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name="entries",
                        to="metrics.metricdefinition",
                    ),
                ),
                (
                    "user",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="metric_entries",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={
                "db_table": "metrics_metric_entry",
            },
        ),
        migrations.AddIndex(
            model_name="metricentry",
            index=models.Index(
                fields=["user", "-recorded_at", "-id"],
                name="metrics_met_user_id_dbaeb1_idx",
            ),
        ),
        migrations.AddIndex(
            model_name="metricentry",
            index=models.Index(
                fields=["user", "metric_definition", "-recorded_at"],
                name="metrics_met_user_id_a16cca_idx",
            ),
        ),
    ]
