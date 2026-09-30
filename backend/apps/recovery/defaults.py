from .models import RecoveryTool


def seed_default_recovery_tools() -> None:
    """Restore shared tools after an isolated browser-test database reset."""
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
        RecoveryTool.objects.update_or_create(
            user=None,
            slug=slug,
            defaults={
                "name": name,
                "description": description,
                "display_order": index,
                "is_active": True,
            },
        )
