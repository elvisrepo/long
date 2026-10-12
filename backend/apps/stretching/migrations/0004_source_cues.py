from django.db import migrations


PREVIOUS_DESCRIPTIONS = {
    "lower-body-lunge-stretch": "Move the hip forward without arching the lower back; gently squeeze the rear-leg glute and rotate the hips slightly.",
    "lower-body-hip-circuit": "Move the leg sideways, then lift it behind you for the final movement.",
    "lower-body-glute-bridges": "Lift the hips by squeezing the glutes and lower with control.",
    "lower-body-cook-hip-lift": "Keep a small ball between the working leg and torso; squeeze the opposite glute and lift slightly, focusing the effort in the glute.",
    "lower-body-clam": "Keep the spine aligned and raise the top leg using the hip muscles.",
    "lower-body-half-squat-half-deadlift": "Hinge and bend into position, then stand by driving through the hips.",
    "lower-body-cat-and-camel-stretch": "Move gently between a rounded and extended back position.",
    "lower-body-dead-bug": "Brace the abdomen and alternate lowering the opposite arm and leg with control.",
    "lower-body-plank": "Keep the body aligned, brace the abdomen and squeeze the glutes.",
    "lower-body-foam-rolling": "Roll slowly across the listed areas and pause briefly where they feel tender.",
    "upper-body-foam-rolling-thoracic-spine": "Use a foam roller across the upper back, moving through centered and side positions.",
    "upper-body-extending-thoracic-spine": "Extend through the upper back while keeping the lower back neutral.",
    "upper-body-extending-thoracic-spine-bench": "Rest the arms on a low bench and gently lower the chest.",
    "upper-body-wall-pec-stretch": "Hold a doorway or stable post and gently move the chest forward.",
    "upper-body-lats-stretch": "Hold a stable beam and lean back until you feel a stretch along the side of the back.",
    "upper-body-shoulder-stretch": "Move the hands behind you and shift forward until you feel a shoulder stretch.",
    "upper-body-shoulder-dislocations": "With a wide grip on a light band or stick, move the arms through a comfortable overhead arc.",
    "upper-body-scapular-wall-slide": "Slide the arms along a wall while keeping the trunk steady.",
    "upper-body-chin-tuck": "Against a wall, gently draw the chin back with a small movement.",
    "upper-body-reverse-crunch": "Lie on your back with knees bent and lift the pelvis in a controlled abdominal curl.",
}

PREVIOUS_DOSAGES = {"lower-body-glute-bridges": "15 slow repetitions"}

SOURCE_DESCRIPTIONS = {
    "lower-body-lunge-stretch": "Move the hip, not the lower back. Squeeze the glute of the leg behind you. Push the hips forward and rotate slightly from side to side.",
    "lower-body-hip-circuit": "Complete circles in both directions, move the leg sideways for abductions, then kick it up for superdogs.",
    "lower-body-glute-bridges": "Move the hips up by squeezing the glutes.",
    "lower-body-cook-hip-lift": "Keep a tennis ball between the working leg and ribcage. Squeeze the other glute and raise several inches, isolating the glute from the lower back and hamstrings.",
    "lower-body-clam": "Keep the spine in one line and raise the upper leg, focusing on the glute muscles.",
    "lower-body-half-squat-half-deadlift": "Bend over and squat down into the pictured position. Move up by using the hips.",
    "lower-body-cat-and-camel-stretch": "Move gently between arching your back and rounding it, coordinating the movement with your breath. The source also cautions against toe touches; this is general reference material, not personalized medical advice.",
    "lower-body-dead-bug": "Pull the belly button inward and bring the knees and arms up. Lower the left leg and right arm, then alternate.",
    "lower-body-plank": "Keep the knees slightly bent, brace the abs, and squeeze the glutes. The source cues a slight arch in the lower back.",
    "lower-body-foam-rolling": "Roll over the hips, quads, calves, and IT band.",
    "upper-body-foam-rolling-thoracic-spine": "Separate the shoulder blades and foam-roll the upper back: work centered, then angled left and right.",
    "upper-body-extending-thoracic-spine": "Use a controlled upper-back extension to work thoracic mobility.",
    "upper-body-extending-thoracic-spine-bench": "Rest the arms on a low bench and gently press the chest down.",
    "upper-body-wall-pec-stretch": "Hold a door ledge or column, then gently push the chest forward.",
    "upper-body-lats-stretch": "Hold a beam and lean back until the lats are stretched.",
    "upper-body-shoulder-stretch": "Place the hands behind you and slide the body forward until a stretch is felt in the shoulders.",
    "upper-body-shoulder-dislocations": "Start with a wide grip on a rope or broomstick. Move the arms around toward the hips, narrowing the grip gradually as mobility allows.",
    "upper-body-scapular-wall-slide": "Activate the mid-back and bring the elbows as low as possible without arching the lower back.",
    "upper-body-chin-tuck": "Stand with the back and head against a wall. Keep the back of the head against the wall and roll the chin down toward the neck; it is a very small movement.",
    "upper-body-reverse-crunch": "Lie on the floor with knees bent. Curl the knees toward the head using the abs, keeping the feet down, legs squeezed, and head on the floor. Lower the pelvis after each rep; work the abs rather than the hip flexors, and do not let the legs pass perpendicular.",
}

SOURCE_DOSAGES = {"lower-body-glute-bridges": "15 slow movements up and down"}


def update_source_cues(apps, schema_editor):
    Exercise = apps.get_model("stretching", "StretchExercise")
    for slug, description in SOURCE_DESCRIPTIONS.items():
        Exercise.objects.filter(slug=slug).update(description=description)
    for slug, dosage in SOURCE_DOSAGES.items():
        Exercise.objects.filter(slug=slug).update(dosage=dosage)


def restore_previous_cues(apps, schema_editor):
    Exercise = apps.get_model("stretching", "StretchExercise")
    for slug, description in PREVIOUS_DESCRIPTIONS.items():
        Exercise.objects.filter(slug=slug).update(description=description)
    for slug, dosage in PREVIOUS_DOSAGES.items():
        Exercise.objects.filter(slug=slug).update(dosage=dosage)


class Migration(migrations.Migration):
    dependencies = [("stretching", "0003_lower_body_catalog_details")]

    operations = [migrations.RunPython(update_source_cues, restore_previous_cues)]
