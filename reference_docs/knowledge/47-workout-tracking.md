# Workout tracking — decisions and implementation plan (2026-10-01)

## Use When

Read before implementing Workouts: product scope, FitNotes references, starter
catalog ownership, session/set semantics, history preservation, and phased delivery.

## Status and agreed product direction

The first backend slice now implements the catalog, sessions, ordered exercise
occurrences, set logging, copying/history and account lifecycle. The routines
slice adds four template models in migration `0004_routines` (ten workout models
in four migrations); the canonical contracts are in
[API design](03-api-design.md). The basic frontend, history/copy and dashboard
slice is now implemented locally (2026-10-02). Phase 5's first routine workflow
is implemented; its other conveniences and phase 6 remain unimplemented.
The separate `.lavish/workout-prototype.html` is a sample-only
review prototype, not the real Workouts tab. No cloud deployment is implied.
Local PostgreSQL now has all four workout migrations applied, including routine
tables. The full backend suite passes 660 tests (42 original workout and 14 routine
checks); 402 frontend tests, three updated workout/routine browser fixture flows,
type checks, lint, build and migration drift checks pass. The running local routine
endpoint returns `401` without authentication. This is local verification, not
staging acceptance or live browser-to-Django E2E coverage.

The real authenticated `/workouts` tab provides Home, All exercises, Training,
and History. Start explicitly initializes samples and creates a selected-day
session; library GET never seeds. Category/exercise management includes search,
order, archive/restore and editable notes/defaults. Set forms use immutable
snapshot type/units, support comments, planned/completed entry, editing/deletion,
repeat and explicit prior-set suggestions. Finish/reopen and session details are
available; copying creates independent planned work. History is a paginated
90-day window ending on the selected date, with exercise filtering; the activity
strip and compact dashboard summary always cover today and its six preceding days.
Planned-only sessions do not count as training. Server-confirmed queries, error
states and pending-control guards are covered; no optimistic success is shown.
Browser checks use isolated API fixtures, not users' live workouts. No cloud
deployment or native background-timer behavior is implied.

- Add an authenticated Workouts tab, using Longevity's existing visual system.
- Every account gets the complete basic workout log. Advanced Pro analysis is a
  possible future addition, not a committed entitlement or current restriction.
- Include a small editable sample catalog of categories and exercises, unlike
  Diet's empty catalog. Samples are starting points, not prescribed training.
- Workouts record sessions and individual sets, not daily checklist check-offs.
  Support multiple sessions on one calendar date.
- Cover strength, bodyweight and cardio: relevant combinations of weight, reps,
  distance and duration. Do not force irrelevant fields into every exercise.
- Existing Metrics remains the home for bodyweight and other body measurements;
  do not add a duplicate Body Tracker or store workout sets as MetricEntry rows.

## Reference review

All ten pages below were read, including their embedded screenshots. Adopt useful
interaction concepts, not FitNotes branding, images, native Android chrome or
Supporter-tier restrictions.

| Reference | Relevant concepts |
| --- | --- |
| [Quick Start](https://www.fitnotesapp.com/quick_start/) | Start session, choose exercise, enter sets, review workout. |
| [Home Screen](https://www.fitnotesapp.com/home_screen/) | Date navigation, compact exercise/set cards, workout notes, copying and ordering. |
| [Workout Tracking](https://www.fitnotesapp.com/workout_tracking/) | Fast entry, set editing/comments, completion, exercise notes, supersets. |
| [Exercises](https://www.fitnotesapp.com/exercises/) | Editable samples, categories, search, exercise types and unit preferences. |
| [Progress Tracking](https://www.fitnotesapp.com/progress_tracking/) | Exercise history, charts, records and goals; observed records versus estimates. |
| [Routines](https://www.fitnotesapp.com/routines/) | Reusable plans, named routine days, ordered exercises and planned sets. |
| [Calendar](https://www.fitnotesapp.com/calendar/) | Month/list history with drill-down to workouts; richer filters later. |
| [Body Tracker](https://www.fitnotesapp.com/body_tracker/) | Measurement history/graphs overlap with existing Metrics. |
| [Settings](https://www.fitnotesapp.com/settings/) | Units, increments, completion preferences, exports and preservation of data. |
| [Workout Tools](https://www.fitnotesapp.com/workout_tools/) | Rest timer, estimated 1RM, percentage-based sets and equipment-aware plates. |

## Data and behavior safeguards

- Seed independent owner-editable catalog rows once per user, including existing
  accounts. Explicit POST initialization locks the owner and creates a
  `WorkoutCatalogState` marker once. Subsequent calls do not recreate samples
  the user has deliberately archived or changed. GET does not seed. Starter
  catalog: seven categories and ten exercises; all are private editable copies.
- Derive ownership from authentication. Scope every catalog, session, exercise
  occurrence and set lookup to that owner; reject cross-owner nested references.
- Distinguish planned sets from performed/completed sets. Normal logging records
  completed work; copying or planning produces uncompleted sets. Only completed
  sets contribute to activity summaries, volume or personal records.
- Missing quantities are unknown, not fabricated zero values. Bodyweight work
  may omit external load; explicitly entered zero load is not the same as missing.
- A copied workout is an independent instance. Routine edits must never rewrite
  past sessions. Changing catalog defaults must not reinterpret historical units
  or field types. Name, category name, tracking type, weight unit and distance unit
  are snapshotted on each session exercise. Existing quantities never undergo an
  implicit unit conversion; a library unit change affects newly added occurrences.
- Archive categories/exercises rather than cascading away historical training.
  Unit conversions must preserve physical quantities; never silently relabel
  numeric values or erase old fields when changing an exercise type.
- Record separate rows for repeated sets so each can have its own values,
  completion state and comment. Keep explicit exercise and set ordering.
- Use local-calendar dates consistently with Diet/Recovery. A seven-day dashboard
  window ends today, independent of the selected workout date.
- Keep training summaries descriptive, not longevity, health or recovery scores.
  Clearly distinguish estimated 1RM from an observed lift; do not treat planned
  sets as records or promise estimates as lifting prescriptions.
- Include owner-scoped workout data and archives in full account export/deletion.

## Implemented backend entities

UUIDs identify the five domain resources; the initialization marker uses its
user one-to-one FK as primary key. See the current ERD for fields.

- `ExerciseCategory`: owner, name, order, archive state.
- `Exercise`: category, name, tracking type, notes and applicable entry defaults.
  Ownership follows the category; category changes must remain within one owner.
- `Workout`: owner, calendar date, optional name/notes and session state.
- `WorkoutExercise`: workout, exercise reference, order and historical settings
  needed to prevent later catalog edits from reinterpreting recorded sets.
- `WorkoutSet`: workout exercise, order, applicable quantities/units, comment
  and planned/completed state.
- `WorkoutCatalogState`: user one-to-one plus initialization timestamp. It is
  separate from the user profile so workout initialization stays in this module.

Weight/distance values are fixed decimals (3 places); duration is integer seconds,
reps positive integers. Missing is null; zero external load is valid. Planned sets
may omit relevant fields. Completed strength requires weight/reps, bodyweight
requires reps (optional weight), timed exercises require duration, cardio requires
distance/duration. Both planned/completed sets reject irrelevant supplied fields.
Set PATCH validates combined values. Ordering uses nonnegative numeric order
with ID tie-breaking; appends use the current maximum plus ten.

The library has no hard-delete endpoint. RESTRICT protects exercises referenced
by history, but account deletion can cascade all owned rows together. Archive
prevents newly adding the exercise to a session; existing snapshots remain
editable. Finished sessions require reopening before exercise/set edits. Finishing
does not complete planned sets. Copies reset completion and clear session notes
and set comments, retaining quantities and snapshot settings.

History is owner-scoped, date-bounded (1–366 days), paginated (25 default/100 max),
and can filter by an owned exercise ID. It does not yet provide a dashboard aggregate
or dedicated analytics endpoint. Catalog search is case-insensitive, max 120 chars.

Foreign keys alone do not establish that all nested references belong to the
same user. Enforce that invariant in validated owner-scoped mutation logic and
test it explicitly. Avoid speculative routine/group/calculator tables in the
basic logging migration; introduce them with their corresponding behavior.

## Phased implementation plan

### Routine delivery checkpoint — 2026-10-02

All accounts can create private routines, save sessions as named days, rename/order
and archive/restore routines, manage day metadata or remove a template with explicit
confirmation, and start an independent planned workout on the selected date.
Template replacement is atomic, from an own saved workout with at least one
exercise. All copied sets lose completion/performance comments; routine sets never
have those fields. Snapshot units/type/order/quantities stay frozen. Archived
library exercises remain usable within existing templates, matching workout-copy
semantics. Routine archive must restore before day mutation/start.

Day instructions, not source-session/performance notes or routine metadata notes,
are copied into the planned session. Its combined routine/day name is capped at
120 characters. Changing/removing a day or deleting its source workout cannot
change already-created sessions. No source-workout or routine FK is stored on
generated Workout rows. Export/deletion includes all four new tables.

The first editor reuses the existing training flow: start a planned workout,
change exercises/sets, then Save as routine day → explicitly replace the template.
This leaves a real planned session, not a temporary draft; planned-only sessions
do not count as training. Direct template set editing is still future work.

### 1. Models, starter catalog and ownership

Backend implemented and tested, including concurrent PostgreSQL initialization.

Finalize field types, unit semantics, snapshots and completion validation. Write
failing model/API ownership tests, then migrations and idempotent starter seeding.
Verify existing users, repeat initialization, archive preservation, multiple daily
sessions, valid exercise types and rejection of cross-user relationships.

### 2. Catalog and workout logging API

Backend implemented and tested; see canonical API, security and testing docs.

Implement category/exercise creation, editing, ordering, archive/restore and
search; session and exercise-occurrence management; set create/edit/delete,
comments and completion; bounded date/history reads; transactional workout copy
with completion reset. Add full account export/deletion coverage. Decide public
endpoint contracts in this slice and document them alongside the API tests.

### 3. Workouts tab and fast set entry

Add date controls, start/resume session, exercise search/selection, compact cards
and a prominent set-entry form. Include previous recorded values as editable
suggestions, quick repeat entry, per-set editing/comments, planned/completed
indicators and workout notes. Avoid hidden gesture-only controls; make ordering
and actions keyboard accessible. Test pending/error states, mobile layouts and
existing themes without fabricating successful saves.

### 4. History, copying and dashboard

Expose session and per-exercise history with copy-to-date workflows. Add a small
dashboard summary of completed training and a Workouts link, consistent with the
compact Diet/Recovery summaries. Confirm planned-only sessions do not inflate
activity counts, archived exercises remain readable, and the history window is
anchored to today. Basic logging is usable at the end of this phase.

### 5. Planning and convenience

Add routines with named days, independent planned-session copies, supersets or
circuits, optional next-exercise navigation, rest timer and month-calendar view.
Deliver as small tested slices rather than one large expansion. For a web timer,
calculate remaining time from a deadline; evaluate actual background-tab/mobile
behavior before promising native-like sound, vibration or background alerts.

### 6. Analysis and calculators

Add exercise-specific progress charts and observed personal records, then clearly
labelled estimated 1RM, goals, percentage-based set calculations and configurable
plate/bar inventory. Recompute or invalidate derived records after corrections
and deletions. Calculator output added to a session is planned, not completed.
Decide any advanced Pro boundary separately; do not gate the basic log retroactively.

## Delivery and documentation gates

Use the repository's [TDD playbook](../playbooks/TTD.process.md): test list, one
concrete failing test, pass, refactor, repeat. Run focused tests before broader
relevant suites; include API owner-isolation and browser workflow tests.

When implementation changes public contracts, update
[API design](03-api-design.md), this domain document, relevant
[security guidance](08-security-owasp-top10-and-bottlenecks.md) and
[testing](21-testing.md) in the same slice. Update entity/ERD and frontend docs
as their implementation lands; clearly separate planned from implemented tables.
Search for stale route references before broad tests. No deployment or database
migration to a cloud environment is implied by this record. The checked-in
migrations are `workouts.0001` (catalog), `0002` (sessions/snapshots), and `0003`
(sets), plus `0004_routines` (four template tables). Check the actual environment's
migration status before claiming deployment.
