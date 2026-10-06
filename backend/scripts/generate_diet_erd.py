"""Generate the 13/16-table Diet ERD comparison without reading personal data."""

import os
from pathlib import Path

import django

from scripts.generate_recovery_erd import MODEL_LABELS, schema_svg


def main() -> None:
    os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.test")
    django.setup()
    from django.apps import apps

    existing = [apps.get_model(label) for label in MODEL_LABELS]
    additions = [
        apps.get_model(f"diet.{name}")
        for name in ["DietSection", "DietFood", "DietEntry"]
    ]
    destination = (
        Path(__file__).resolve().parents[2] / "reference_docs/knowledge/diagrams"
    )
    for suffix, selected in [("before", existing), ("after", existing + additions)]:
        (destination / f"diet-erd-{suffix}.svg").write_text(
            schema_svg(
                selected,
                f"{'Before Diet' if suffix == 'before' else 'With Diet'} — {len(selected)} domain tables",
                highlighted_app="diet",
            ),
            encoding="utf-8",
        )
    print(f"Generated 13/16-table Diet ERD comparison in {destination}")


if __name__ == "__main__":
    main()
