"""Generate before/after domain schema maps from models, without database reads.

Run from backend: uv run python -m scripts.generate_recovery_erd
Foreign-key targets are explicit inside each entity rather than a dense web of
crossing connectors. Framework tables and many-to-many auth tables are omitted.
"""

import os
from html import escape
from pathlib import Path
from textwrap import wrap
from typing import Any

import django

MODEL_LABELS = [
    "users.User",
    "metrics.MetricDefinition",
    "metrics.MetricEntry",
    "wearables.WearableConnection",
    "wearables.SyncRun",
    "subscriptions.SubscriptionPlan",
    "subscriptions.SubscriptionPrice",
    "subscriptions.Subscription",
    "subscriptions.BillingCustomer",
    "subscriptions.CheckoutAttempt",
    "subscriptions.StripeWebhookEvent",
    "recovery.RecoveryTool",
    "recovery.RecoveryEntry",
]


def field_line(field: Any) -> str:
    types = {
        "UUIDField": "uuid",
        "BigAutoField": "bigint",
        "AutoField": "int",
        "DateTimeField": "datetime",
        "DateField": "date",
        "BooleanField": "bool",
        "FloatField": "float",
        "JSONField": "json",
        "PositiveIntegerField": "int",
        "PositiveSmallIntegerField": "smallint",
    }
    if field.is_relation:
        target = field.remote_field.model
        return f"{field.column} FK → {target.__name__}.{field.target_field.name}" + (
            " (nullable)" if field.null else ""
        )
    kind = types.get(field.get_internal_type(), "text")
    flags = " PK" if field.primary_key else " UK" if field.unique else ""
    return f"{field.column}: {kind}{flags}" + (" (nullable)" if field.null else "")


def schema_svg(models: list[Any], title: str) -> str:
    width = 1410
    cards: list[str] = []
    y = 110
    existing = [model for model in models if model._meta.app_label != "recovery"]
    additions = [model for model in models if model._meta.app_label == "recovery"]
    rows = [existing[offset : offset + 3] for offset in range(0, len(existing), 3)]
    if additions:
        rows.append(additions)
    for row in rows:
        row_height = max(
            75
            + 23
            * sum(
                len(wrap(field_line(field), width=50)) for field in model._meta.fields
            )
            for model in row
        )
        for column, model in enumerate(row):
            x = 25 + column * 460
            added = model._meta.app_label == "recovery"
            fill, border = ("#e6f7ec", "#22854f") if added else ("#eef4fc", "#4475ab")
            name = model.__name__ + (" · NEW" if added else "")
            card = [
                f'<g id="{model.__name__}"><rect x="{x}" y="{y}" width="440" height="{row_height}" rx="10" fill="{fill}" stroke="{border}" stroke-width="2"/>',
                f'<text x="{x + 16}" y="{y + 28}" class="name">{escape(name)}</text>',
                f'<text x="{x + 16}" y="{y + 48}" class="table">{escape(model._meta.db_table)}</text>',
            ]
            index = 0
            for field in sorted(
                model._meta.fields, key=lambda field: not field.primary_key
            ):
                for line in wrap(field_line(field), width=50):
                    text = f'<text x="{x + 16}" y="{y + 76 + 23 * index}" class="field">{escape(line)}</text>'
                    if field.is_relation and field.remote_field.model in models:
                        text = (
                            f'<a href="#{field.remote_field.model.__name__}">{text}</a>'
                        )
                    card.append(text)
                    index += 1
            cards.append("\n".join(card) + "</g>")
        y += row_height + 30
    return f'''<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{y + 15}" viewBox="0 0 {width} {y + 15}" role="img" aria-labelledby="title desc">
<title id="title">{escape(title)}</title>
<desc id="desc">Domain entity relationship schema map. FK arrows name the referenced parent. Each parent can have zero or many children. Nullable foreign keys allow zero or one parent. New recovery tables are green.</desc>
<style>text{{font-family:Arial,sans-serif;fill:#1b2b34}}.name{{font-size:19px;font-weight:bold}}.table{{font-size:12px;fill:#50636f}}.field{{font-family:Consolas,monospace;font-size:13px}}a:hover text{{fill:#00795e}}</style>
<rect width="100%" height="100%" fill="#ffffff"/>
<text x="25" y="36" class="name">{escape(title)}</text>
<text x="25" y="64" class="field">Blue: existing tables · Green: new recovery tables · PK: primary key · FK → parent · UK: unique field</text>
{"".join(cards)}
</svg>'''


def main() -> None:
    os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.test")
    django.setup()
    from django.apps import apps

    models = [apps.get_model(label) for label in MODEL_LABELS]
    destination = (
        Path(__file__).resolve().parents[2] / "reference_docs/knowledge/diagrams"
    )
    for suffix, selected in [("before", models[:-2]), ("after", models)]:
        (destination / f"recovery-erd-{suffix}.svg").write_text(
            schema_svg(
                selected,
                f"{'Before recovery' if suffix == 'before' else 'With recovery'} — {len(selected)} domain tables",
            ),
            encoding="utf-8",
        )
    relationships = []
    for model in models:
        for field in model._meta.fields:
            if field.is_relation:
                parent = field.remote_field.model.__name__
                cardinality = "0..1" if field.null else "1"
                deletion = field.remote_field.on_delete.__name__
                status = (
                    "**NEW**" if model._meta.app_label == "recovery" else "Existing"
                )
                relationships.append(
                    f"| {model.__name__}.{field.column} | {parent}.{field.target_field.name} | {cardinality} | {deletion} | {status} |"
                )
    document = (
        """# Domain ERD — before and after recovery tracking

## Use When

Read for the domain ERD immediately before this recovery slice and the updated
schema. Generated from Django models on 2026-09-30, excluding framework/auth-M2M
tables. This is a model/migration snapshot, not proof of an AWS database change.

## 1. Before — 11 domain tables

![Domain ERD before recovery](recovery-erd-before.svg)

[Open full-size before diagram](recovery-erd-before.svg).

## 2. After — 13 domain tables

Existing tables stay blue. `RecoveryTool` and `RecoveryEntry` are **green**.
No columns are added to any existing domain table in this slice.

![Domain ERD with recovery](recovery-erd-after.svg)

[Open full-size updated diagram](recovery-erd-after.svg).

## Relationships

Each FK references one parent, or zero/one when nullable. Each parent can have
zero/many child rows; scoped uniqueness rules below may restrict those rows.
FK arrows are written inside entity cards rather than overlapping connector
lines. `StripeWebhookEvent` intentionally has no domain FK.

| Child FK | Parent PK | Parents per child | Delete rule | Change |
|---|---|---|---|---|
"""
        + "\n".join(relationships)
        + """

## Recovery rules

- `RecoveryTool.user_id=NULL` means shared; otherwise the tool is private.
- Shared recovery slugs are unique; custom tools are not assigned evidence.
- `RecoveryEntry(user_id, tool_id, performed_on)` is unique: one check-off/day.
- Index `(user_id, performed_on)` supports bounded user-history reads.
- The API permits only shared tools or the user's own tools; a foreign key alone
  does not enforce matching owners across the two tables.
- Archiving changes `is_active`, not history. User deletion cascades owned data.
- Existing subscription tables decide Pro creation; no new billing table is needed.
- Existing metric/subscription/wearable uniqueness constraints remain unchanged.

See [recovery implementation and evidence](../45-recovery-tracking.md).
Regenerate from `backend`: `uv run python -m scripts.generate_recovery_erd`.
"""
    )
    (destination / "recovery-erd-comparison.md").write_text(document, encoding="utf-8")
    print(
        f"Generated {len(models) - 2}-table before and {len(models)}-table after ERDs in {destination}"
    )


if __name__ == "__main__":
    main()
