import uuid

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("metrics", "0012_respiratory_rate_skin_temperature"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]
    operations = [
        migrations.CreateModel(
            name="WeeklyAiReview",
            fields=[
                (
                    "id",
                    models.UUIDField(
                        primary_key=True,
                        default=uuid.uuid4,
                        editable=False,
                        serialize=False,
                    ),
                ),
                ("model", models.CharField(max_length=150)),
                ("timezone", models.CharField(max_length=100)),
                ("period_start", models.DateField()),
                ("period_end", models.DateField()),
                ("generated_at", models.DateTimeField()),
                ("result_encrypted", models.TextField()),
                (
                    "user",
                    models.ForeignKey(
                        to=settings.AUTH_USER_MODEL,
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="weekly_ai_reviews",
                    ),
                ),
            ],
            options={
                "ordering": ["-generated_at", "-id"],
                "indexes": [
                    models.Index(
                        fields=["user", "-generated_at"],
                        name="ai_review_user_generated_idx",
                    )
                ],
            },
        )
    ]
