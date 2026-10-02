# Workout tracking — decisions and implementation plan (2026-10-01)

## Use When

Read before implementing Workouts: product scope, FitNotes references, starter
catalog ownership, session/set semantics, history preservation, and phased delivery.

## Status and agreed product direction

Exercise overview and strength goals follow-up: `view=overview` brings Statistics,
History, Graphs, Records and Goals together, reachable from library/training.
Completed-only statistics aggregate distinct sessions, sets, reps, recorded
volume, distance/time and first/last training dates per frozen type/unit partition.
Goals target actual strength weight/reps, with explicit at-least/exact rep rules,
frozen units, supporting-lift navigation and recalculation after corrections.
Creation requires active strength entries and is capped at 20 targets per exercise;
timed/cardio/bodyweight goals remain future work. Migration 0008 adds ExerciseGoal;
no existing logged set snapshot changes. Goal export/deletion follows account
lifecycle. See API/testing docs for exact contracts and verification.

Daily-use follow-up: account-owned persisted auto-start rest, group auto-advance and separate metric/imperial equipment defaults; editable exercise favorites and preferred graphs; completed-only last-used/session-count hints; multi-word library search. Migration 0007 adds preferences and library metadata only. Equipment saving is explicit and cannot create workout sets; GET remains read-only. All tiers retain these basic controls. Accessible ordering, selective copy/routine carry-forward, cardio metrics and calendar filters remain the next implementation slices. Export/sharing UI, session timing, offline logging and background alerts are separate follow-ups.

The first backend slice now implements the catalog, sessions, ordered exercise
occurrences, set logging, copying/history and account lifecycle. The routines
slice adds four template models in migration `0004_routines`; `0005_exercise_groups`
adds group labels to template/session occurrences; `0006_group_colours` adds
colours to both; `0007_workout_preferences` adds account preferences and exercise
favorites/preferred graphs; `0008_exercise_goals` adds actual strength targets
(twelve models, eight migrations).
The canonical contracts are in
[API design](03-api-design.md). The basic frontend, history/copy and dashboard
slice is now implemented locally (2026-10-02). Phase 5's first routine workflow
and the remaining phase 5 conveniences are implemented. Phase 6 now includes
windowed charts/records, calculators, exercise statistics and strength goals;
other goal types and advanced analysis remain future work.
The separate `.lavish/workout-prototype.html` is a sample-only
review prototype, not the real Workouts tab. No cloud deployment is implied.
Normal local and isolated E2E PostgreSQL have all eight workout migrations applied.
Latest verification: 716 backend tests and 482 frontend tests pass.
Three real Django browser flows
at 320/390/1440px pass. Type checks, lint, build and migration drift pass. Live
flows cover direct editing, independent starts, groups, timer, calculator plans,
windowed records, two-date charts, compact calendar cells, calendar-source copying,
preference/favorite persistence after reload, exercise overview/statistics,
goal create/edit/reload/source/removal, and browsing without workout creation. Screenshots
were inspected. This is local verification, not staging acceptance or cloud deployment.

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

### All-time progress and personal records — 2026-10-02

The Progress window selector now includes All time, meaning completed history
through the selected tracking date. New owner-scoped progress/records endpoints
aggregate in PostgreSQL and paginate summaries, rather than downloading all raw
workouts. Frozen types/units stay separate; estimates retain the existing Epley
1–10-rep eligibility. All-time strongest loads per rep count expose the actual
source set and its exercise/workout. PR history lists the first qualifying set and
strict improvements with 25-row pagination and source navigation. Ties retain the
earliest source. This history is derived from current saved sets and recomputes on
edit/deletion/uncompletion, not an immutable record audit. Available on all plans;
no schema migration, Pro gate, automatic conversion or edits to existing user data.
See API contracts in `03-api-design.md` and coverage in `21-testing.md`.

### Browsing/removal/history UX correction — 2026-10-02

- Exercise progress now offers graph selection: estimated 1RM, max load/reps/set
  volume, exact-rep max load, workout exercise volume/reps, and windowed per-rep
  personal records. These are completed-only and retain frozen unit/type partitions.
  Workout totals keep same-day sessions separate; volume is recorded load × reps,
  not body mass. Estimated 1RM uses the existing Epley formula, with a tighter
  positive-load/1–10-rep graph limit. Higher-rep sets remain in other graphs. Point
  details show the winning set's recorded weight/reps, retaining the first source
  on ties. The graph explains that it does not account for reps left in reserve;
  this is a set-derived estimate, not a measured maximum. The standalone calculator
  still accepts 1–30 reps with its uncertainty note.
  1RM follow-up verification: 79 focused workout tests, 459 frontend tests and
  three real-Django flows at 320/390/1440px pass; lint/typecheck/build, formatting
  and whitespace checks pass. Mobile source details inspected. No schema/API
  changes or edits to users' saved workouts; not committed or deployed.
  Cardio/duration expose their measures; bodyweight never fabricates mass-based
  estimates. Point details support tap or keyboard selection and date drill-down.
  The initial Personal records graph was a selected-window table; the follow-up
  above adds all-time server summaries without a schema or Pro entitlement change.
  Graph-selector verification: 76 focused workout checks, 456 frontend checks,
  three fixture workout flows and three real-Django flows at 320/390/1440px pass.
  Lint/typecheck/build, format and whitespace checks pass. Inspected screenshots
  prompted container-width SVG sizing for readable mobile axis labels and locally
  scrolling tables. No commit, push, cloud deployment or user-data mutation.

- Home Copy previous workout now opens a marked month calendar and lets the user
  choose a source date/session, including planned sessions. Browsing never changes
  the original destination date. Explicit copy creates an independent planned session
  through the existing API; empty sources are disabled. Cancellation performs no write,
  pending copies lock controls, and read/write failures keep the modal with retry.
  Calendar-copy verification: 62 focused workout tests, 442 frontend tests, three
  existing fixture workout flows and three real-Django flows at 320/390/1440px
  pass. Lint/typecheck/build and whitespace checks pass; mobile/desktop screenshots
  inspected. No backend contract/schema changes, commit or deployment in this slice.

- All exercises opens library details/history/progress, never starts a workout
  implicitly. The navigation tab clears session context; Home Start is explicit.
- Session Add exercise opens an existing occurrence if present, preferring one
  with sets. Existing duplicate blocks are retained, not merged/deleted automatically.
  Backend still permits multiple occurrences; no schema/REST contract changed.
- Overview cards and Training expose confirmed Remove exercise. It permanently
  removes only this occurrence and its sets, not the library or other workouts.
  Finished sessions require reopening; failed deletion stays visible in the modal.
- Training history now includes and labels the current session, with Back to Track.
  Other sessions have one Open exercise link despite duplicate entries. Full
  pagination is still available. Previous-set suggestions still exclude current work.
- Progress continues to count completed sets only. It explicitly lists dates
  with only planned sets for the chosen exercise, aggregating across sessions so
  a date with any completed work is not falsely labelled excluded.
- Progress charts now label a zero-based numeric/unit axis and horizontal
  gridlines, with adaptive 1/2/5 tick spacing. Decimal, large and all-zero load
  ranges remain finite; exact recorded values/units and completed-only aggregation
  are unchanged. The 70/75/80 kg example shows 0, 10, 20 through 80 kg.
  Axis follow-up: 58 focused workout checks, 438 frontend checks, and three
  real-Django responsive flows pass; lint/build/whitespace checks pass. Desktop
  and phone screenshots were inspected. No backend/schema or record changes.
- Follow-up verification: 54 focused workout checks, 434 total frontend tests,
  35 fixture browser checks and three real-Django flows at 320/390/1440px pass.
  Lint, TypeScript/Vite build, formatting and whitespace checks pass; responsive
  history/removal screenshots were inspected. Backend/schema unchanged, no new
  migration and no user-data cleanup. The recorded 672 backend checks belong to
  the preceding backend/group slice, not a backend rerun for this UI-only change.

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

UUIDs identify the nine domain resources; the initialization marker uses its
user one-to-one FK as primary key. Account preferences also use that primary key.

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
- `WorkoutPreferences`: owner one-to-one, auto-start/advance flags, metric and
  imperial bar weights and bounded plate inventories. Reads return defaults
  without creating this row; explicit saves create it. Account deletion cascades it.

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

The direct editor now creates empty days and manages their exercises, ordering
and planned quantities without generating a Workout. Edit day includes the
template builder. Removing an exercise/set requires confirmation and never
changes existing sessions. Capture/replacement from a saved workout remains an
alternative. Empty days cannot start. No schema change is needed for this editor.

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
migration status before claiming deployment. `0005_exercise_groups` adds blank
group labels to both occurrence models without a new group table.

### Convenience and analysis checkpoint — 2026-10-02

- Direct routine editing now supports empty days, exercise/set management and
  numeric ordering without creating a session.
- `group_name` links exact matching labels within a session/day; blank ungroups.
  Session Add to group / Edit group now opens a real picker/editor, with generated
  editable `Superset N` name, selected occurrence included, colour and member choices.
  Add exercise selects from the active private library, creating additions only
  on Save. Group edits replace membership/name/colour atomically, reject rename
  collisions, and can move existing members from other groups. Remove-current and
  confirmed Delete group only unlink; all exercises/sets remain. Colours appear as
  bars in the training sidebar and workout overview. Template direct label editing
  remains available; captured routines retain group colours. No new group table.
  Copies/capture/start/export retain labels and colours independently. UI advancement
  defaults on, can be disabled, and cycles
  after confirmed new completion, including planned-set completion and repeat.
  It never advances on failure, plans or editing already-completed work.
- Rest defaults come from the current library exercise. A deadline-based visual
  timer catches up after delayed ticks/visibility changes; optional auto-start
  shares the confirmed-completion event. It survives internal workout navigation,
  but leaving Workouts/reloading clears it. No guaranteed background sound,
  vibration, notification or native alarm behavior is promised.
- Calendar uses bounded month reads and separates sessions with completed sets
  from planned-only sessions (empty sessions also appear as plans). Date selection
  opens Home without shifting the today-anchored seven-day strip.
- Progress reads 30/90/180/365-day windows with an owned exercise filter and safe
  pagination. Completed rows alone form daily maximum charts and observed records.
  Frozen type/unit combinations are separate; no implicit conversion. Strength
  records are maximum load per rep-count; other types show highest logged reps,
  distance or duration, not fitness scores. Records are windowed, not all-time,
  and recompute after corrections/deletions through query invalidation. Chart
  values and exact record dates have accessible tables.
- Strength calculators provide estimated 1RM and derived 2–15-rep estimates,
  percentage/nearest-increment loads, and balanced plates with configurable bar,
  sizes and finite counts. The plate search is exact (not greedy) and bounded;
  it reports no combination or a complexity-limit error rather than fabricated
  loading. Calculation inputs are temporary; inventory defaults can be explicitly
  persisted per account and unit. Percentage output is added
  only as a planned set with unknown reps and the occurrence's saved unit.
- Estimated max uses conventional Epley `load × (1 + reps / 30)` (one entered
  rep returns its load), bounded to 1–30 reps with a high-rep uncertainty note.
  Formula/limitations were checked against the published research discussion in
  [Macarilla et al. (2022)](https://pmc.ncbi.nlm.nih.gov/articles/PMC9465738/).
  An estimate is not an observed lift or lifting prescription.
- Isolated E2E containers were recreated against the current Docker network,
  retaining `backend_pgdata_e2e`. Normal development services/volumes were not
  replaced. Workout live tests use a dedicated :5176 Vite proxy to :8001 Django;
  only E2E settings trust the additional origin. No Stripe outbound calls.
- Live artifacts use ignored `playground/workout-live-results` and screenshots
  use `playground/workout-live-screenshots`, separate from fixture output to avoid
  trace cleanup collisions. A browser probe reproduced the non-toggling native
  `<output>` inside a summary; countdown now uses non-interactive `span role=timer`.
  Visual review also caught generic button padding overriding mobile calendar
  padding; a cell-height regression guards it. Date changes preserve History/
  Progress exercise selection, and confirmed template set saves reset the draft.
