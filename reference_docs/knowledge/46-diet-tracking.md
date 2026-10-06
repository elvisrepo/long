# Diet tracking — 2026-10-01 local implementation

## Use When

Read for the food checklist, ownership model, archive behavior, calendar dates,
API contracts, dashboard summary, and account export/deletion.

## Product boundary

Every account can create its own sections and foods. There are no defaults,
Pro creation gates, portion quantities, calorie totals, nutrient estimates,
research ratings or diet-quality scores. Checking Chicken means the user recorded
eating Chicken on that calendar date, not a measured protein intake.

## Tables and ownership

- `DietSection`: UUID, user FK, name (120 characters), display order, active flag.
- `DietFood`: UUID, section FK, name (120 characters), display order, active flag.
  Its owner is `food.section.user`; no redundant food user column.
- `DietEntry`: bigint PK, user FK, food FK, `performed_on` date, creation timestamp.
  Unique `(user, food, performed_on)` and index `(user, performed_on)`.
- Section names are case-insensitively unique per user; food names per section,
  including archived rows. The same food name can exist in different sections.
- User identity is derived from authenticated requests, never accepted from input.
  Both read and write lookups are owner-scoped. Mutations lock the user row inside
  a transaction, serializing edits/check-offs with account deletion and each other.
- An entry's owner must match its food's section owner. The API enforces this;
  `DietEntry.clean()` validates it for explicit model validation. Ordinary foreign
  keys **do not** enforce this cross-table rule. Direct ORM writes must call
  `full_clean()` or use equivalent validated owner-scoped logic.

## Management and history

Create, rename, reorder, archive and restore both sections and foods. Creation
appends using the next display-order value; edits accept a nonnegative order.
Foods cannot move between sections, preserving historical grouping. Renaming
does change the name shown for past entries; names are not historical snapshots.

Archiving only changes `is_active`; it does not erase check-offs or alter a
section's food flags. Restore the section before adding/restoring foods or
recording new check-offs. Undo remains available for archived history, including
the Recorded foods list. There are no hard-delete catalog endpoints.

Entry reads require both date bounds, with an inclusive range of 1–366 days.
PUT is idempotent and returns the entry; DELETE is idempotent and returns 204.
See [canonical endpoints](03-api-design.md).

## Frontend

- Authenticated `/diet` tab, useful empty state, compact section cards and food
  checkboxes. Add section/food opens a shared modal; Manage checklist exposes
  renaming, numeric ordering and archive/restore controls.
- Selected local-calendar date has previous/next, date input and Today controls.
  Calendar-day values are stored without UTC conversion. Date arithmetic uses
  local noon to avoid daylight-saving midnight pitfalls.
- Last 7 days always ends with **today**, not the selected date. Counts include
  archived foods and are activity counts, not completion targets.
- Server-confirmed saves invalidate selected-day and history queries. Pending
  reads/writes disable check-offs; errors do not fabricate successful or empty data.
- Owner-scoped query keys isolate catalogs and entries; successful logout clears
  all query caches. Dark/Light/Sand use existing application tokens.
- Dashboard shows today's food count, distinct recorded days out of seven, and a
  link to Diet. It shares an equal-width desktop row with Recovery, stacking at
  680px or less. Two short summary lines replace food lists/explanatory paragraphs;
  only history is fetched. Its loading/error state does not block the dashboard.

## Account lifecycle and verification

Full account JSON adds `diet_sections`, `diet_foods`, and `diet_entries`, scoped
to the owner and including archives. User deletion cascades sections, foods and
entries while leaving other users' data intact.

Migration `diet.0001_initial` is applied **locally**. This record does not establish
staging deployment. API tests cover ownership, uniqueness, archive/restore,
date ranges, JWT, idempotency and account lifecycle; UI and isolated Chromium
fixtures cover creation, selected-day tracking, history, management and dashboard.

See [13→16-table ERD](diagrams/diet-erd-comparison.md).
