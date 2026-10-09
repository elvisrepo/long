from django.db import migrations


EXERCISES = [
    (
        "lower-body-lunge-stretch",
        "30 seconds per leg",
        "Move the hip forward without arching the lower back; gently squeeze the rear-leg glute and rotate the hips slightly.",
    ),
    (
        "lower-body-hip-circuit",
        "10 circles each way, 10 abductions, 10 superdogs",
        "Move the leg sideways, then lift it behind you for the final movement.",
    ),
    (
        "lower-body-glute-bridges",
        "15 slow repetitions",
        "Lift the hips by squeezing the glutes and lower with control.",
    ),
    (
        "lower-body-cook-hip-lift",
        "10 per leg",
        "Keep a small ball between the working leg and torso; squeeze the opposite glute and lift slightly, focusing the effort in the glute.",
    ),
    (
        "lower-body-clam",
        "10 per leg",
        "Keep the spine aligned and raise the top leg using the hip muscles.",
    ),
    (
        "lower-body-half-squat-half-deadlift",
        "10 per leg",
        "Hinge and bend into position, then stand by driving through the hips.",
    ),
    (
        "lower-body-cat-and-camel-stretch",
        "10 repetitions",
        "Move gently between a rounded and extended back position.",
    ),
    (
        "lower-body-dead-bug",
        "10 repetitions",
        "Brace the abdomen and alternate lowering the opposite arm and leg with control.",
    ),
    (
        "lower-body-plank",
        "Hold for 60 seconds",
        "Keep the body aligned, brace the abdomen and squeeze the glutes.",
    ),
    (
        "lower-body-foam-rolling",
        "Hips, quads, calves, IT band",
        "Roll slowly across the listed areas and pause briefly where they feel tender.",
    ),
]


def update_catalog(apps, schema_editor):
    Exercise = apps.get_model("stretching", "StretchExercise")
    for slug, dosage, description in EXERCISES:
        Exercise.objects.filter(slug=slug).update(
            dosage=dosage,
            description=description,
        )


def clear_catalog_details(apps, schema_editor):
    Exercise = apps.get_model("stretching", "StretchExercise")
    Exercise.objects.filter(slug__in=[item[0] for item in EXERCISES]).update(
        dosage="",
        description="",
    )


class Migration(migrations.Migration):
    dependencies = [("stretching", "0002_upper_body_catalog_details")]

    operations = [migrations.RunPython(update_catalog, clear_catalog_details)]
