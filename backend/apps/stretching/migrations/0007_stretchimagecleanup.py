from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("stretching", "0006_stretchexercise_image_key_stretchexercise_user_and_more")
    ]

    operations = [
        migrations.CreateModel(
            name="StretchImageCleanup",
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
                ("object_key", models.CharField(max_length=500, unique=True)),
                ("queued_at", models.DateTimeField(auto_now_add=True)),
                ("attempt_count", models.PositiveIntegerField(default=0)),
                ("last_attempt_at", models.DateTimeField(blank=True, null=True)),
            ],
            options={"ordering": ["queued_at", "id"]},
        ),
    ]
