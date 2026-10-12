from .models import StretchExercise


EXERCISES = [
    (
        "lower-body-lunge-stretch",
        StretchExercise.Phase.LOWER_BODY,
        "Lunge Stretch",
        "30 seconds per leg",
        "Move the hip, not the lower back. Squeeze the glute of the leg behind you. Push the hips forward and rotate slightly from side to side.",
    ),
    (
        "lower-body-hip-circuit",
        StretchExercise.Phase.LOWER_BODY,
        "Hip Circuit",
        "10 circles each way, 10 abductions, 10 superdogs",
        "Complete circles in both directions, move the leg sideways for abductions, then kick it up for superdogs.",
    ),
    (
        "lower-body-glute-bridges",
        StretchExercise.Phase.LOWER_BODY,
        "Glute Bridges",
        "15 slow movements up and down",
        "Move the hips up by squeezing the glutes.",
    ),
    (
        "lower-body-cook-hip-lift",
        StretchExercise.Phase.LOWER_BODY,
        "Cook Hip Lift",
        "10 per leg",
        "Keep a tennis ball between the working leg and ribcage. Squeeze the other glute and raise several inches, isolating the glute from the lower back and hamstrings.",
    ),
    (
        "lower-body-clam",
        StretchExercise.Phase.LOWER_BODY,
        "Clam",
        "10 per leg",
        "Keep the spine in one line and raise the upper leg, focusing on the glute muscles.",
    ),
    (
        "lower-body-half-squat-half-deadlift",
        StretchExercise.Phase.LOWER_BODY,
        "Half Squat, Half Deadlift",
        "10 per leg",
        "Bend over and squat down into the pictured position. Move up by using the hips.",
    ),
    (
        "lower-body-cat-and-camel-stretch",
        StretchExercise.Phase.LOWER_BODY,
        "Cat and Camel Stretch",
        "10 repetitions",
        "Move gently between arching your back and rounding it, coordinating the movement with your breath. The source also cautions against toe touches; this is general reference material, not personalized medical advice.",
    ),
    (
        "lower-body-dead-bug",
        StretchExercise.Phase.LOWER_BODY,
        "Dead Bug",
        "10 repetitions",
        "Pull the belly button inward and bring the knees and arms up. Lower the left leg and right arm, then alternate.",
    ),
    (
        "lower-body-plank",
        StretchExercise.Phase.LOWER_BODY,
        "Plank",
        "Hold for 60 seconds",
        "Keep the knees slightly bent, brace the abs, and squeeze the glutes. The source cues a slight arch in the lower back.",
    ),
    (
        "lower-body-foam-rolling",
        StretchExercise.Phase.LOWER_BODY,
        "Foam Rolling",
        "Hips, quads, calves, IT band",
        "Roll over the hips, quads, calves, and IT band.",
    ),
    (
        "upper-body-foam-rolling-thoracic-spine",
        StretchExercise.Phase.UPPER_BODY,
        "Foam Rolling Thoracic Spine",
        "10× centered, 10× left, 10× right",
        "Separate the shoulder blades and foam-roll the upper back: work centered, then angled left and right.",
    ),
    (
        "upper-body-extending-thoracic-spine",
        StretchExercise.Phase.UPPER_BODY,
        "Extending Thoracic Spine",
        "10 reps",
        "Use a controlled upper-back extension to work thoracic mobility.",
    ),
    (
        "upper-body-extending-thoracic-spine-bench",
        StretchExercise.Phase.UPPER_BODY,
        "Extending Thoracic Spine (Bench)",
        "10 reps",
        "Rest the arms on a low bench and gently press the chest down.",
    ),
    (
        "upper-body-wall-pec-stretch",
        StretchExercise.Phase.UPPER_BODY,
        "Wall Pec Stretch",
        "45 seconds each arm",
        "Hold a door ledge or column, then gently push the chest forward.",
    ),
    (
        "upper-body-lats-stretch",
        StretchExercise.Phase.UPPER_BODY,
        "Lats Stretch",
        "45 seconds per arm",
        "Hold a beam and lean back until the lats are stretched.",
    ),
    (
        "upper-body-shoulder-stretch",
        StretchExercise.Phase.UPPER_BODY,
        "Shoulder Stretch",
        "Hold for 60 seconds",
        "Place the hands behind you and slide the body forward until a stretch is felt in the shoulders.",
    ),
    (
        "upper-body-shoulder-dislocations",
        StretchExercise.Phase.UPPER_BODY,
        "Shoulder Dislocations",
        "15 reps",
        "Start with a wide grip on a rope or broomstick. Move the arms around toward the hips, narrowing the grip gradually as mobility allows.",
    ),
    (
        "upper-body-scapular-wall-slide",
        StretchExercise.Phase.UPPER_BODY,
        "Scapular Wall Slide",
        "10 reps",
        "Activate the mid-back and bring the elbows as low as possible without arching the lower back.",
    ),
    (
        "upper-body-chin-tuck",
        StretchExercise.Phase.UPPER_BODY,
        "Chin tuck",
        "10 reps",
        "Stand with the back and head against a wall. Keep the back of the head against the wall and roll the chin down toward the neck; it is a very small movement.",
    ),
    (
        "upper-body-reverse-crunch",
        StretchExercise.Phase.UPPER_BODY,
        "Reverse Crunch",
        "3× max",
        "Lie on the floor with knees bent. Curl the knees toward the head using the abs, keeping the feet down, legs squeezed, and head on the floor. Lower the pelvis after each rep; work the abs rather than the hip flexors, and do not let the legs pass perpendicular.",
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
