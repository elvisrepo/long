from django.db import migrations, models


EXERCISES = [
    (
        "upper-body-neck-mobility",
        "upper-body-foam-rolling-thoracic-spine",
        "Foam Rolling Thoracic Spine",
        "10× centered, 10× left, 10× right",
        "Use a foam roller across the upper back, moving through centered and side positions.",
    ),
    (
        "upper-body-shoulder-rolls",
        "upper-body-extending-thoracic-spine",
        "Extending Thoracic Spine",
        "10 reps",
        "Extend through the upper back while keeping the lower back neutral.",
    ),
    (
        "upper-body-chest-opener",
        "upper-body-extending-thoracic-spine-bench",
        "Extending Thoracic Spine (Bench)",
        "10 reps",
        "Rest the arms on a low bench and gently lower the chest.",
    ),
    (
        "upper-body-thoracic-extension",
        "upper-body-wall-pec-stretch",
        "Wall Pec Stretch",
        "45 seconds each arm",
        "Hold a doorway or stable post and gently move the chest forward.",
    ),
    (
        "upper-body-wall-slides",
        "upper-body-lats-stretch",
        "Lats Stretch",
        "45 seconds per arm",
        "Hold a stable beam and lean back until you feel a stretch along the side of the back.",
    ),
    (
        "upper-body-scapular-retractions",
        "upper-body-shoulder-stretch",
        "Shoulder Stretch",
        "Hold for 60 seconds",
        "Move the hands behind you and shift forward until you feel a shoulder stretch.",
    ),
    (
        "upper-body-wrist-flexor-stretch",
        "upper-body-shoulder-dislocations",
        "Shoulder Dislocations",
        "15 reps",
        "With a wide grip on a light band or stick, move the arms through a comfortable overhead arc.",
    ),
    (
        "upper-body-wrist-extensor-stretch",
        "upper-body-scapular-wall-slide",
        "Scapular Wall Slide",
        "10 reps",
        "Slide the arms along a wall while keeping the trunk steady.",
    ),
    (
        "upper-body-doorway-pec-stretch",
        "upper-body-chin-tuck",
        "Chin tuck",
        "10 reps",
        "Against a wall, gently draw the chin back with a small movement.",
    ),
    (
        "upper-body-standing-side-bend",
        "upper-body-reverse-crunch",
        "Reverse Crunch",
        "3× max",
        "Lie on your back with knees bent and lift the pelvis in a controlled abdominal curl.",
    ),
]


def update_catalog(apps, schema_editor):
    Exercise = apps.get_model("stretching", "StretchExercise")
    for old_slug, new_slug, name, dosage, description in EXERCISES:
        Exercise.objects.filter(slug=old_slug).update(
            slug=new_slug,
            name=name,
            dosage=dosage,
            description=description,
        )


def restore_catalog(apps, schema_editor):
    Exercise = apps.get_model("stretching", "StretchExercise")
    for old_slug, new_slug, *_ in EXERCISES:
        Exercise.objects.filter(slug=new_slug).update(
            slug=old_slug,
            name=old_slug.removeprefix("upper-body-").replace("-", " ").title(),
            dosage="",
            description="",
        )


class Migration(migrations.Migration):
    dependencies = [("stretching", "0001_initial")]

    operations = [
        migrations.AddField(
            model_name="stretchexercise",
            name="dosage",
            field=models.CharField(blank=True, max_length=120),
        ),
        migrations.RunPython(update_catalog, restore_catalog),
    ]
