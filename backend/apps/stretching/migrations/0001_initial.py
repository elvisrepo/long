import uuid

from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


LOWER_BODY = [
    "Lunge Stretch",
    "Hip Circuit",
    "Glute Bridges",
    "Cook Hip Lift",
    "Clam",
    "Half Squat, Half Deadlift",
    "Cat and Camel Stretch",
    "Dead Bug",
    "Plank",
    "Foam Rolling",
]

UPPER_BODY = [
    "Neck Mobility",
    "Shoulder Rolls",
    "Chest Opener",
    "Thoracic Extension",
    "Wall Slides",
    "Scapular Retractions",
    "Wrist Flexor Stretch",
    "Wrist Extensor Stretch",
    "Doorway Pec Stretch",
    "Standing Side Bend",
]


def seed_exercises(apps, schema_editor):
    Exercise = apps.get_model("stretching", "StretchExercise")
    Exercise.objects.bulk_create(
        [
            Exercise(
                slug=f"{phase}-{name.lower().replace(' ', '-').replace(',', '')}",
                phase=phase,
                name=name,
                description="",
                display_order=index + 1,
            )
            for phase, names in (("lower-body", LOWER_BODY), ("upper-body", UPPER_BODY))
            for index, name in enumerate(names)
        ]
    )


def unseed_exercises(apps, schema_editor):
    apps.get_model("stretching", "StretchExercise").objects.filter(
        slug__startswith="lower-body-"
    ).delete()
    apps.get_model("stretching", "StretchExercise").objects.filter(
        slug__startswith="upper-body-"
    ).delete()


class Migration(migrations.Migration):
    initial = True

    dependencies = [migrations.swappable_dependency(settings.AUTH_USER_MODEL)]

    operations = [
        migrations.CreateModel(
            name="StretchExercise",
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
                ("slug", models.SlugField(max_length=80, unique=True)),
                (
                    "phase",
                    models.CharField(
                        choices=[
                            ("lower-body", "Lower body & hips"),
                            ("upper-body", "Upper body & posture"),
                        ],
                        max_length=20,
                    ),
                ),
                ("name", models.CharField(max_length=120)),
                ("description", models.CharField(blank=True, max_length=500)),
                ("display_order", models.PositiveIntegerField(default=100)),
                ("is_active", models.BooleanField(default=True)),
            ],
            options={"ordering": ["phase", "display_order", "name", "id"]},
        ),
        migrations.CreateModel(
            name="StretchEntry",
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
                    "exercise",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="entries",
                        to="stretching.stretchexercise",
                    ),
                ),
                (
                    "user",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="stretching_entries",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={"ordering": ["performed_on", "id"]},
        ),
        migrations.AddConstraint(
            model_name="stretchentry",
            constraint=models.UniqueConstraint(
                fields=("user", "exercise", "performed_on"),
                name="unique_daily_stretch_entry",
            ),
        ),
        migrations.AddIndex(
            model_name="stretchentry",
            index=models.Index(
                fields=["user", "performed_on"], name="stretch_user_day_idx"
            ),
        ),
        migrations.RunPython(seed_exercises, unseed_exercises),
    ]
