from .models import StretchExercise


EXERCISES = [
    (
        "lower-body-lunge-stretch",
        StretchExercise.Phase.LOWER_BODY,
        "Lunge Stretch",
        "30 seconds per leg",
        "Move the hip forward without arching the lower back; gently squeeze the rear-leg glute and rotate the hips slightly.",
    ),
    (
        "lower-body-hip-circuit",
        StretchExercise.Phase.LOWER_BODY,
        "Hip Circuit",
        "10 circles each way, 10 abductions, 10 superdogs",
        "Move the leg sideways, then lift it behind you for the final movement.",
    ),
    (
        "lower-body-glute-bridges",
        StretchExercise.Phase.LOWER_BODY,
        "Glute Bridges",
        "15 slow repetitions",
        "Lift the hips by squeezing the glutes and lower with control.",
    ),
    (
        "lower-body-cook-hip-lift",
        StretchExercise.Phase.LOWER_BODY,
        "Cook Hip Lift",
        "10 per leg",
        "Keep a small ball between the working leg and torso; squeeze the opposite glute and lift slightly, focusing the effort in the glute.",
    ),
    (
        "lower-body-clam",
        StretchExercise.Phase.LOWER_BODY,
        "Clam",
        "10 per leg",
        "Keep the spine aligned and raise the top leg using the hip muscles.",
    ),
    (
        "lower-body-half-squat-half-deadlift",
        StretchExercise.Phase.LOWER_BODY,
        "Half Squat, Half Deadlift",
        "10 per leg",
        "Hinge and bend into position, then stand by driving through the hips.",
    ),
    (
        "lower-body-cat-and-camel-stretch",
        StretchExercise.Phase.LOWER_BODY,
        "Cat and Camel Stretch",
        "10 repetitions",
        "Move gently between a rounded and extended back position.",
    ),
    (
        "lower-body-dead-bug",
        StretchExercise.Phase.LOWER_BODY,
        "Dead Bug",
        "10 repetitions",
        "Brace the abdomen and alternate lowering the opposite arm and leg with control.",
    ),
    (
        "lower-body-plank",
        StretchExercise.Phase.LOWER_BODY,
        "Plank",
        "Hold for 60 seconds",
        "Keep the body aligned, brace the abdomen and squeeze the glutes.",
    ),
    (
        "lower-body-foam-rolling",
        StretchExercise.Phase.LOWER_BODY,
        "Foam Rolling",
        "Hips, quads, calves, IT band",
        "Roll slowly across the listed areas and pause briefly where they feel tender.",
    ),
    (
        "upper-body-foam-rolling-thoracic-spine",
        StretchExercise.Phase.UPPER_BODY,
        "Foam Rolling Thoracic Spine",
        "10× centered, 10× left, 10× right",
        "Use a foam roller across the upper back, moving through centered and side positions.",
    ),
    (
        "upper-body-extending-thoracic-spine",
        StretchExercise.Phase.UPPER_BODY,
        "Extending Thoracic Spine",
        "10 reps",
        "Extend through the upper back while keeping the lower back neutral.",
    ),
    (
        "upper-body-extending-thoracic-spine-bench",
        StretchExercise.Phase.UPPER_BODY,
        "Extending Thoracic Spine (Bench)",
        "10 reps",
        "Rest the arms on a low bench and gently lower the chest.",
    ),
    (
        "upper-body-wall-pec-stretch",
        StretchExercise.Phase.UPPER_BODY,
        "Wall Pec Stretch",
        "45 seconds each arm",
        "Hold a doorway or stable post and gently move the chest forward.",
    ),
    (
        "upper-body-lats-stretch",
        StretchExercise.Phase.UPPER_BODY,
        "Lats Stretch",
        "45 seconds per arm",
        "Hold a stable beam and lean back until you feel a stretch along the side of the back.",
    ),
    (
        "upper-body-shoulder-stretch",
        StretchExercise.Phase.UPPER_BODY,
        "Shoulder Stretch",
        "Hold for 60 seconds",
        "Move the hands behind you and shift forward until you feel a shoulder stretch.",
    ),
    (
        "upper-body-shoulder-dislocations",
        StretchExercise.Phase.UPPER_BODY,
        "Shoulder Dislocations",
        "15 reps",
        "With a wide grip on a light band or stick, move the arms through a comfortable overhead arc.",
    ),
    (
        "upper-body-scapular-wall-slide",
        StretchExercise.Phase.UPPER_BODY,
        "Scapular Wall Slide",
        "10 reps",
        "Slide the arms along a wall while keeping the trunk steady.",
    ),
    (
        "upper-body-chin-tuck",
        StretchExercise.Phase.UPPER_BODY,
        "Chin tuck",
        "10 reps",
        "Against a wall, gently draw the chin back with a small movement.",
    ),
    (
        "upper-body-reverse-crunch",
        StretchExercise.Phase.UPPER_BODY,
        "Reverse Crunch",
        "3× max",
        "Lie on your back with knees bent and lift the pelvis in a controlled abdominal curl.",
    ),
]


def seed_default_stretch_exercises() -> None:
    """Restore the shared starter catalog after an isolated E2E reset."""
    for index, (slug, phase, name, dosage, description) in enumerate(EXERCISES):
        StretchExercise.objects.update_or_create(
            slug=slug,
            defaults={
                "phase": phase,
                "name": name,
                "dosage": dosage,
                "description": description,
                "display_order": (index % 10) + 1,
                "is_active": True,
            },
        )
