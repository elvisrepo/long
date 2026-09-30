# Recovery tracking — local implementation

## Use When

Read when changing recovery tools, daily check-offs, Pro access, research bars,
or recovery account export/deletion. Implemented locally on 2026-09-30; this
record does not establish staging deployment or live acceptance.

## Daily tracking UX (September 30, 2026)

The page separates research-based tools from private custom tools. Compact
previous/next-day controls, a date picker and Today shortcut select the calendar
date; seven clickable history tiles select earlier days. The daily summary counts
recorded activities without a completion target. On mobile it appears before tools.
Research bars retain the same DOMS scaling; SMD and confidence intervals are under
each tool's Research details disclosure. Pro creation uses the shared accessible
modal, with cancellation, retained input on failure and focus restored on close.
Saving/Saved feedback follows server confirmation. Previous history stays visible
while a new day loads, but checkboxes are disabled until its data arrives.

## Storage and access

Recovery is a separate Django app, not a numeric metric or wearable sample.
Two PostgreSQL tables are added:

- `RecoveryTool`: UUID id, nullable user FK (NULL = shared), slug, name,
  description, display_order, is_active. Shared slugs are unique.
- `RecoveryEntry`: bigint id, user FK, tool FK, performed_on date, created_at.
  Unique `(user, tool, performed_on)` and index `(user, performed_on)`.

All accounts can check off six shared tools. Creation of private custom tools
requires the current subscription plan code `pro`, checked server-side, never
a client-submitted plan. No custom-tool quota is introduced in this slice.
After downgrade, existing custom tools remain available; new creation is blocked.
Owners may rename, archive and restore custom tools; shared tools cannot be
edited through the API. Archived history remains readable; new check-offs for
archived tools are rejected. User deletion cascades entries and owned tools,
not shared tools or another account's data. The full JSON account export adds
`recovery_tools` (owned tools and referenced shared tools) and `recovery_entries`.

## API and dates

JWT is required for all `/api/v1/recovery/` routes. Catalog and history are
owner-scoped. GET entries requires `date_from` and `date_to`, inclusive, with
a maximum 366-day window. PUT creates one daily check-off idempotently; DELETE
undoes it idempotently. Mutation transactions lock the user row, coordinating
with subscription transitions and account deletion. The database uniqueness
constraint is the final duplicate guard.

`performed_on` is a calendar date supplied by the client, not a UTC timestamp.
The browser initializes it from the local calendar and displays a selected date
plus its preceding six days. History counts include archived tools; the selected
date count describes active-tool check-offs, not recovery progress. A change in
timezone does not reinterpret an existing date. Failed writes do not optimistically
change the checkbox. Queries are scoped by authenticated owner. Successful logout
cancels requests and clears all query caches, including older metric/subscription
data, so a different account does not inherit cached private state.

## Research bars

Source: [Dupuy et al. (2018), Table 1](https://www.frontiersin.org/journals/physiology/articles/10.3389/fphys.2018.00403/full).
The paper searched literature through November 2017. This is a source-specific
display, not a comprehensive current evidence ranking or medical prescription.

| Tool | DOMS SMD | 95% CI | Subjects | Experimental groups |
|---|---:|---|---:|---:|
| Massage | -2.26 | -3.05 to -1.47 | 158 | 14 |
| Active recovery | -0.94 | -1.61 to -0.28 | 90 | 8 |
| Compression garments | -0.92 | -1.34 to -0.50 | 160 | 16 |
| Cryotherapy / cryostimulation | -0.53 | -1.04 to -0.03 | 72 | 6 |
| Water immersion | -0.47 | -0.77 to -0.18 | 379 | 34 |
| Contrast water therapy | -0.40 | -0.73 to -0.07 | 144 | 12 |

The API owns these constants; custom tools always have `evidence: null`, even if
their names match a studied method. Bars use
`clamp(0, 100, max(0, -smd) / 2.26 * 100)` as a visual length only. They never
claim percentage effectiveness, recovery speed or superiority from direct
head-to-head trials. Exact SMD and 95% CI are visible. Water immersion is pooled,
not labelled cold-water-only. Perceived fatigue and CK/IL-6/CRP are different
outcomes and are not averaged into this score. An optional fatigue view is not
implemented in this first slice. Study heterogeneity, possible bias, inability
to blind and lack of performance outcomes limit interpretation.

The user does not need to perform every tool. Custom tools are labelled
"Not research-rated". Check-off counts are activities, not health assessments.

## Verification

`backend/tests/test_recovery.py` covers auth, exact evidence, ownership,
idempotency, ranges/dates, Pro creation, archive/downgrade, export and deletion.
Frontend recovery API/component tests cover transport, permissions/errors,
check-off save/undo, date switching and custom-tool archiving. Mocked browser
tests cover narrow and desktop layouts; no test sends real payments or deploys.
