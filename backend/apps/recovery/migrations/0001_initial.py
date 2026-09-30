import uuid

import django.db.models.deletion
from django.apps.registry import Apps
from django.conf import settings
from django.db import migrations, models
from django.db.backends.base.schema import BaseDatabaseSchemaEditor


def seed_tools(apps: Apps, schema_editor: BaseDatabaseSchemaEditor) -> None:
    tool = apps.get_model("recovery", "RecoveryTool")
    rows = [
        ("massage", "Massage", "Post-exercise massage."),
        ("active-recovery", "Active recovery", "Gentle movement after exercise."),
        (
            "compression",
            "Compression garments",
            "Garments worn during post-exercise recovery.",
        ),
        (
            "cryotherapy",
            "Cryotherapy / cryostimulation",
            "Cold-air exposure; distinct from water immersion.",
        ),
        (
            "immersion",
            "Water immersion",
            "Pooled water-immersion evidence, not a cold-only estimate.",
        ),
        (
            "contrast-water",
            "Contrast water therapy",
            "Alternating cold and warm water.",
        ),
    ]
    for index, (slug, name, description) in enumerate(rows):
        tool.objects.using(schema_editor.connection.alias).create(
            slug=slug, name=name, description=description, display_order=index
        )


class Migration(migrations.Migration):
    initial = True
    dependencies = [migrations.swappable_dependency(settings.AUTH_USER_MODEL)]
    operations = [
        migrations.CreateModel(
            name="RecoveryTool",
            fields=[
                (
                    "id",
                    models.UUIDField(
                        default=uuid.uuid4,
                        editable=False,
                        primary_key=True,
                        serialize=False,
                    ),
                ),
                ("slug", models.SlugField(blank=True, max_length=80)),
                ("name", models.CharField(max_length=120)),
                ("description", models.CharField(blank=True, max_length=500)),
                ("display_order", models.PositiveIntegerField(default=100)),
                ("is_active", models.BooleanField(default=True)),
                (
                    "user",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="recovery_tools",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={
                "ordering": ["display_order", "name", "id"],
                "constraints": [
                    models.UniqueConstraint(
                        condition=models.Q(user__isnull=True),
                        fields=("slug",),
                        name="unique_shared_recovery_slug",
                    )
                ],
            },
        ),
        migrations.RunPython(seed_tools, migrations.RunPython.noop),
    ]
