import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("recovery", "0001_initial")]
    operations = [
        migrations.CreateModel(
            name="RecoveryEntry",
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
                ("performed_on", models.DateField()),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                (
                    "tool",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="entries",
                        to="recovery.recoverytool",
                    ),
                ),
                (
                    "user",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="recovery_entries",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={
                "ordering": ["performed_on", "id"],
                "constraints": [
                    models.UniqueConstraint(
                        fields=("user", "tool", "performed_on"),
                        name="unique_daily_recovery_entry",
                    )
                ],
                "indexes": [
                    models.Index(
                        fields=["user", "performed_on"], name="recovery_user_day_idx"
                    )
                ],
            },
        )
    ]
