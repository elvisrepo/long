# Workout tracking — decisions and implementation plan (2026-10-01)

## Use When

Read before implementing Workouts: product scope, FitNotes references, starter
catalog ownership, session/set semantics, history preservation, and phased delivery.

## Status and agreed product direction

Combined cardio goals (2026-10-05): Overview → Goals offers Distance within a time
limit, e.g. at least 5 km within 25 minutes. Both raw thresholds must hold in one
completed cardio set; no split estimates, summed sets, pace extrapolation or unit
conversion. Saved type and both units remain frozen. Progress selects the single
set with the highest weaker ratio (distance/target versus limit/recorded time),
stable earliest ties; it stays below 100 until achieved. Cards show that set's
actual distance/time and supporting-workout navigation, not a scalar guessed best.
Inputs are minimum saved km/mi and limit minutes/seconds; duration-only goals still
mean longer. Partial API edits retain the other target; existing goals keep their
contracts, archives stay readable/editable, and source corrections/deletions
recalculate. Migration 0011 adds two nullable fields plus strict SQL shape/bounds;
goal export/account deletion includes them. Existing owner locks, all-tier access,
20-goal cap and confirmation/error handling remain. No new routes, recorded-set
rewrites or deployment. Multi-set targets/split tracking remain future work.

Bulk history editing (2026-10-05): Training → Exercise history and library Exercise
overview → History offer Edit multiple sets. Choose up to 100 loaded sets across
dates/duplicate occurrences; finished workouts remain disabled until reopened.
Completion/planned status, shared numeric values, explicit comment replacement or
clearing, and deletion require a before/after preview followed by confirmation.
Blank numeric inputs preserve existing values. Numeric edits require matching
saved types and both units; no conversion. Comments/completion/deletion may mix
partitions. The new owner-locked atomic `sets/bulk/` endpoint validates all IDs,
expected full snapshots, open workouts and combined values before writing.
Stale data rejects the entire batch; failed previews remain with explicit Refresh
history/review guidance, never auto retry. Success refreshes workout/history,
statistics/graphs/records/goals; no bulk timer/group advance. Deleted sets/comments
are permanent, but exercises/workouts remain. No schema change, undo or offline queue.
This selects loaded history, not all-time/unseen pages. Snapshot checks detect
changed values, not every intervening change (no version/ABA guarantee).

Metric goals (2026-10-05): migration 0010 preserves strength targets and adds
bodyweight rep goals, cardio distance/duration/speed/pace goals, and timed duration
goals. Each target evaluates one completed set, not session totals. Higher is
better except pace (lower); speed/pace pair distance and seconds in the same set.
Saved type/units stay immutable and separate after catalog edits. Reps allow any
optional recorded load without assuming body mass. Duration means at least that
long, not a fastest race time. Supporting-set links and correction-driven
recalculation remain; no permanent badge. Pace inputs use minutes/seconds, API
stores three-decimal minutes, and rounded display labels do not drive achievement.
New metric progress cannot round up to 100 until achieved. Existing all-tier access,
active-only creation, 20-target cap, ownership/export/deletion and strength payloads
remain. SQL constrains goal shape/type/bounds; API checks integer reps/seconds.

Workout duration (2026-10-03): explicit per-session Start/Resume/Pause controls
in Home and Training; merely creating/copying/starting a routine does not start
timing. Migration 0009 adds nullable accumulated duration and running timestamp.
Server-authoritative elapsed time survives refresh/background inactivity; rest
counts unless paused. Finish stops timing; Reopen stays paused. Manual correction
or Clear duration pauses the clock and never changes sets/completion. Old logs remain
Not tracked, not zero. Each session is independent (multiple clocks can run).
Totals use whole seconds and cap at seven days; forgotten clocks can be corrected.
Errors advise refresh to resolve ambiguous writes, not optimistic timer state.
Account JSON includes stored timing; CSV/text includes the loaded elapsed snapshot.
No automatic public sharing, background alarm, paid gate or new route.

Selected-workout export (2026-10-03): Home session cards offer Export workout,
including finished sessions, with a read-only text preview, local CSV download
and explicit clipboard copy. All occurrences/sets, groups, saved values/units and
planned/completed status are retained, including duplicates and empty entries.
Session notes/set comments are excluded by default and included only by an explicit
checkbox. CSV quotes cells, escapes quotes/newlines and neutralizes spreadsheet
formula prefixes; it is not a restorable backup. Clipboard failures retain a manual
copy preview. No public links, automatic sharing, backend writes, new endpoints or
schema changes. Filters do not trim an export. Full account JSON export remains
separate. Session timing is implemented above; offline logging and background
alerts are future slices.

Calendar filters (2026-10-03): shared Calendar and copy-picker controls select
exercise, saved category name and completed training versus planned-only/empty
drafts. Filtering uses the existing complete month read, not a new API contract.
Exercise/category criteria must match the same frozen occurrence; training requires
a completed matching set, not a finished-session flag or unrelated exercise's sets.
Duplicate occurrences still count as one session. Choices include recorded/archived
history; selected filters retain their labels across months and reset explicitly.
No-match and read errors are distinct; pending/busy controls lock. Filters do not
edit workouts or the copy destination and never trim a source workout silently:
the separate copy selection step still receives all its exercises/sets. Filters
are transient and reset when leaving Calendar or entering copy selection. No
schema, backend, route or API changes. Selected-workout export is implemented above.

Cardio speed/pace (2026-10-03): windowed and all-time graphs offer Max speed and
Best pace, also available as saved default graphs. Rates require positive distance
and time paired within a completed cardio set. Speed is distance × 3600 / seconds;
pace is seconds / (distance × 60), stored as decimal minutes and shown as m:ss per
saved km/mile. Each date selects highest speed or lowest pace in its frozen partition;
all-time/window best pace also selects the minimum. Plans/missing quantities/other
types/future dates are excluded; km and miles stay separate. These are individual
set rates, not workout averages or route/terrain-adjusted comparisons. API metrics
are additive, source fields unchanged, and no migration or source mutation is needed.
Calendar exercise/category and completed/planned filters are implemented above.

Routine UX clarification (2026-10-03): keep the Routines navigation and existing
domain/API names, but explain that a routine is a training plan and each routine
day is a reusable workout template, not a calendar date. Show plan/template counts,
Add workout template and Edit template actions, and Add exercises for empty
templates with an explanation for disabled Start. Template creation proceeds directly
to exercise setup after confirmation; it never starts a workout. Ordering hints
explain position rather than quantity. No schema, route or API changes.

Selective copying (2026-10-03): calendar source selection, Home and History share
an exercise/set selection dialog and read-only preview before confirmation.
Duplicate occurrences are independent; empty exercise-only copies are allowed.
Server validates all IDs before cloning in an owner-locked transaction, preserves
chosen snapshot values/units/order/groups, generates new IDs, resets all completion
and clears comments/session notes. Full-copy API compatibility remains. Finished
and archived source snapshots remain copyable. No new schema; see API/testing docs for bounds.

Routine carry-forward (2026-10-03): Start opens a read-only preview and supports
exercise/set selection before confirmation. Optional carry-forward is off by default,
fills only blank fields, preserves fixed values (including zero), and uses completed
sets from the latest matching exercise occurrence strictly before the destination date.
Frozen type and both units must match; saved set positions are not compressed.
Missing/planned positions and duplicate matching occurrences stay blank with reasons.
Source dates and filled fields are shown in preview. A plan fingerprint is rechecked
under the owner lock before creation; stale plans return 409 without partial writes.
Starts create independent planned sets without comments, preserve day notes/groups,
and never change the template or source. There is no persisted occurrence lineage
back to the routine, so ambiguous duplicates are not guessed. No migration required.
Cardio speed/pace and calendar filters are implemented above.

Accessible ordering: Home exercise cards and the training sidebar have explicit
Move up/down buttons; training set rows have the same controls. Native buttons
support touch and keyboard, announce saved moves and show retryable failures.
First/last boundaries, pending writes and finished workouts disable moves.
Server-side owner-locked adjacent moves normalize ties atomically while retaining
all recorded values, comments, completion and superset membership. Group cycling
follows the reordered workout. Numeric-order editors remain for direct placement.
No new schema. Selective copying is implemented above.

Exercise overview and strength goals follow-up: `view=overview` brings Statistics,
History, Graphs, Records and Goals together, reachable from library/training.
Completed-only statistics aggregate distinct sessions, sets, reps, recorded
volume, distance/time and first/last training dates per frozen type/unit partition.
Goals target actual strength weight/reps, with explicit at-least/exact rep rules,
frozen units, supporting-lift navigation and recalculation after corrections.
Strength creation requires active strength entries and is capped at 20 targets per exercise;
timed/cardio/bodyweight goals are implemented in migration 0010 above. Migration 0008 adds ExerciseGoal;
no existing logged set snapshot changes. Goal export/deletion follows account
lifecycle. See API/testing docs for exact contracts and verification.

Daily-use follow-up: account-owned persisted auto-start rest, group auto-advance and separate metric/imperial equipment defaults; editable exercise favorites and preferred graphs; completed-only last-used/session-count hints; multi-word library search. Migration 0007 adds preferences and library metadata only. Equipment saving is explicit and cannot create workout sets; GET remains read-only. All tiers retain these basic controls. Accessible ordering, selective copying, routine carry-forward, cardio metrics, calendar filters, selected-workout export and session timing are implemented above. Offline logging and background alerts are separate follow-ups.

The first backend slice now implements the catalog, sessions, ordered exercise
occurrences, set logging, copying/history and account lifecycle. The routines
slice adds four template models in migration `0004_routines`; `0005_exercise_groups`
adds group labels to template/session occurrences; `0006_group_colours` adds
colours to both; `0007_workout_preferences` adds account preferences and exercise
favorites/preferred graphs; `0008_exercise_goals` adds actual strength targets;
`0009_workout_timing` adds nullable session timing; `0010_metric_goals` extends
targets without changing recorded set snapshots; `0011_combined_cardio_goals`
adds distance-within-time targets (twelve models, eleven migrations).
The canonical contracts are in
[API design](03-api-design.md). The basic frontend, history/copy and dashboard
slice is now implemented locally (2026-10-02). Phase 5's first routine workflow
and the remaining phase 5 conveniences are implemented. Phase 6 now includes
windowed charts/records, calculators, exercise statistics, strength and metric goals;
combined cardio goals and bulk corrections are implemented; multi-set/split targets
and advanced analysis remain future work.
The separate `.lavish/workout-prototype.html` is a sample-only
review prototype, not the real Workouts tab. No cloud deployment is implied.
Normal local and isolated E2E PostgreSQL have all eleven workout migrations applied.
Latest verification (2026-10-05): 848 backend and 543 frontend tests pass. Six
real-backend and three fixture browser flows at 320/390/1440px pass, including
timing start/reload/pause/correction/finish/reopen, downloaded CSV contents, cardio
pace goal creation/edit/reload/supporting-source navigation, bodyweight goal
creation/reload, combined distance/time goal progress/edit/reload/source/removal,
bulk correction/stale preview/confirmed deletion and mobile layout.
Lint/build and touched-file formatting pass. Migration drift was checked after
0011; bulk corrections do not change models or migrations. Focused
mypy passes with a fresh temporary cache; the existing default cache crashed
internally and was preserved. See testing docs for this diagnostic boundary.
Metric-goal focused mypy passes with a separate temporary cache. The stopped E2E
server initially timed out during recreation; targeted startup recovered it without
removing database volumes, then all live checks passed. No cloud deployment.
Three real Django browser flows and three mocked workout flows
at 320/390/1440px pass. Type checks, lint, build and migration drift pass. Touched
frontend files pass formatting; global formatting still flags three unchanged
auth/subscription files outside this slice. Live
flows cover direct editing, independent starts, groups, timer, calculator plans,
windowed records, two-date charts, compact calendar cells, calendar-source copying,
preference/favorite persistence after reload, exercise overview/statistics,
goal create/edit/reload/source/removal, routine start previews and explicit blank-only
carry-forward without template mutation, and browsing without workout creation.
Cardio live coverage includes completed distance/time entry, readable speed/pace
graphs and point details, and all-time summaries in the same three viewport flows.
Screenshots were inspected. This is local verification, not staging acceptance or cloud deployment.

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
with ID tie-breaking; appends use the current maximum plus ten. Adjacent moves
normalize sibling orders to multiples of ten in a single owner-locked transaction.

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

### Home compact session hub — 2026-10-21

Approved proposal A applies to Home only, with a selected-date/session-count
panel and full date navigation. A follow-up restores the original bordered
six-destination navigation above the title, wrapping naturally on phones. Loading and failed reads do not masquerade as an empty day. Creation
appears once per state; starting a session still opens the existing exercise picker
without starting timing. The previously removed statistics/week sidebar stays absent.

A FitNotes-inspired follow-up simplifies empty days in the light theme: compact,
unframed date controls above a centered plus icon and Start new workout action,
with Copy previous workout secondary underneath. The repeated introductory copy
and enclosing empty-state card are removed. Populated-day cards remain unchanged;
creation, copy previews, pending locks and explicit timing retain their existing behavior.
The subsequent Home cleanup removes the Workouts title, introductory text and
selected-date/session-count text; the date navigation and picker remain visible.

Session cards distinguish Finished/In progress from completed/planned set counts.
Exercise summaries retain grouping and use expandable exact set rows, preserving
saved units and duplicate occurrences. View/Continue opens the first saved exercise
in Training; a session without exercises opens its picker. Navigation performs no
writes. Notes are a disclosure; Add exercise remains visible.

More actions groups session details, finish/reopen, copy, export, routine capture,
duration correction, exercise management and deletion. Manage exercises deliberately
reveals the existing ordering/removal controls; Done managing hides them. Finished
sessions still require reopening before changes to sets/removal. Existing delete
confirmation, export opt-ins, copy previews, pending locks and server errors remain.
Menu selection closes it and focuses its summary so dialogs can return focus.

Home uses the existing timing behavior in a compact row, with visible running/
paused/untracked state, explicit Start/Pause/Resume, and expandable timing help.
Correct duration opens the same editor from More actions; Training retains its
normal timing presentation. Not tracked is distinct from zero. No public API,
route, schema or timing semantics changed, and this slice was not deployed.


### FitNotes-inspired populated Home log — 2026-10-21

Approved A replaces collapsed set details with exact visible rows in tappable
exercise blocks. Strength rows show saved weight units, reps and status; other
tracking types retain their saved-value labels. Missing values are not zero.
Group marks, duplicate occurrences and per-set comments are retained. Opening a
block only navigates to its existing Training screen. Management controls remain
separate from that target and preserve finished-session restrictions.

Each session has a header menu for details/date changes, notes, finish/reopen,
copy, export, routine capture, management, duration correction and timing help.
Saved notes are visible above exercises when present. Timing is a single row;
help opens a dialog from the menu. Explicit timing semantics remain unchanged.
Add exercise is the primary footer action; View/Continue remains available.
New workout and Copy previous are under Day actions on populated dates. The
approved empty state and bordered navigation remain. No API, route or schema
changes; drag-and-drop, selective export and partial moves remain future options.


### Compact Training log — 2026-10-21

Training now leads with a compact exercise selector and the saved-set table.
Strength rows show saved unit, weight and reps in columns; other tracking types
retain exact value labels. Tapping values edits that row; the separate checkbox
updates completion. Editing keeps existing completion rather than completing a
planned set. Manage sets reveals the existing order controls explicitly.

The entry form follows the log, with primary Save completed set, secondary Add
planned set, and an optional Comment disclosure (existing edit comments open).
Numeric defaults omit redundant trailing zeros. Calculators stay collapsed below
the entry form. Manage workout replaces the always-visible exercise panel with
an explicit disclosure retaining grouping, ordering, adding and removing exercises.
Rest/session timing, frozen units, comments, pending/error behavior and confirmed-
completion-only group advancement remain. No API, route or backend changes.


### Minimal workout overview — 2026-10-21

The owner further simplified populated Home to the exercise log: each card shows
its exercise name and saved weight/reps or the other tracking type's exact values.
Set numbering/status/comments remain available to assistive technology and in
Training, while visible counts, badges, notes, timing row and footer actions are
removed. The compact session toolbar keeps its name for multi-session context,
plus Add exercise and an accessible ellipsis menu. Tapping an exercise enters
Training. Timing opens in a Time workout dialog; notes, copy, export, finish/reopen,
management and correction remain in the session menu. No timing starts merely by
opening a dialog. This supersedes A's visible timing/notes/status presentation.


### Workout URL opens the log — 2026-10-21

A saved `view=training` URL now opens the selected session's complete exercise
log, even when it includes an exercise UUID. It no longer opens set-entry controls
on initial load or refresh. Tapping a card explicitly opens its exercise editor;
Back to workout returns to the same log. The editor is a separate in-page view,
keeping the mounted rest timer's state across internal navigation. Its selector
and group advancement still switch the active editor. Explicit exercise selection
from the library also opens editing; merely opening a workout does not. Home
cards use the same explicit exercise-entry callback. No route names or API paths
change. This corrects the prior mismatch between minimal Home and workout URLs.


### FitNotes-style exercise editor — 2026-10-21

After tapping an exercise, the light editor leads with Track / History / Graph,
stacked numeric controls with minus/plus buttons, Save and Clear, then compact
saved rows with original units. Weight buttons use the library weight increment;
other fields use their existing validated step/minimum. Clear resets only the
unsaved draft and editing selection; no record is written or deleted. Saving an
edited row still preserves completion status. Completion checkboxes retain the
explicit planned-set workflow.

The ellipsis menu contains planned-set entry, previous/repeat shortcuts, comments,
calculators, timing, exercise selection and management. Menu inputs remain linked
to the entry form; an existing comment is retained when editing. The menu supports
Close and Escape; planned submission closes it. Numeric order is preserved on
edit; reordering stays in management. Graph opens existing exercise progress.
The minimal workout log remains the default on opening or refreshing its URL.


### Compact workout actions — 2026-10-21

The workout log overflow has six actions: Edit workout, Time workout, Copy
workout, Export workout, Finish/Reopen workout, and Manage workout. Add exercise
stays next to the overflow. Tapping exercise cards opens editing directly.
Edit workout combines name, date and notes. Time workout contains timer controls,
duration correction and timing help. Manage workout contains exercise ordering
and confirmed removal, Save as routine day, and confirmed workout deletion.
Finished workouts must be reopened before their exercises can be changed.
No route or API contract changes.


### Compact Time workout sheet — 2026-10-21

Time workout follows the FitNotes reference in the app's light theme: date and
ellipsis, Start time, End time, Duration, one full-width Start/Stop/Resume action
and Close. Corrections and timing help are behind Timing options. Actions persist
immediately; no redundant Save step. Stop pauses elapsed timing without finishing
the workout. Duration excludes stopped intervals, so it need not equal end minus
start. Read-only server timestamps survive refresh; unknown legacy timestamps show
Not recorded. Duration corrections clear timestamps rather than implying a false
interval. Local migration 0012 is applied; staging will need it on deployment.

### Selective Share / Export sheet — 2026-10-22

The workout Export action opens a light Share workout sheet with Select all,
exercise-level checkboxes and compact set rows. All records start selected;
partial selection marks parent checkboxes as mixed. Empty exercises remain
selectable, planned sets are identified, and selecting nothing disables output.
Cancel, Options and Share form the footer. Options reveals text/CSV format,
notes/comments (off by default), the selected summary preview and manual copy.
Share opens the browser/device share sheet when available. Otherwise it opens
a Share to chooser with WhatsApp, Gmail, Email and an explicit Copy summary
action; it never silently copies. Non-cancellation share failures also open this
chooser. Native cancellation is quiet. App links open a compose flow and do not
send to a recipient automatically.
CSV downloads and clipboard/native sharing all use only the selected records,
retain recorded units/status and do not modify the stored workout. No API changes.

### Compact Copy workout flow — 2026-10-22

The workout overflow Copy action and Copy previous open a compact source-calendar
picker. Its month navigation and training/planned dots locate saved workouts;
the main Calendar filters remain on the full Calendar page. Multiple sessions on
a date remain separate choices. History's explicit Copy action goes directly to
that session's selection sheet.

Copy selection uses the light compact exercise/set checklist with Select all and
mixed parent states, plus Cancel / Edit / Copy. Edit reveals the destination date
and return-to-source control. Copy performs the existing full/subset API call
directly, without a separate preview step. Copied records remain planned, notes
and comments stay on the original, and empty exercise copies remain supported.
Pending actions are locked; a failed save retains selection/date for retry.
No API, route or backend changes.

### Workout overview selection and drag order — 2026-10-22

A 500ms press-and-hold selects an exercise without opening its editor. Movement,
pointer cancellation and leaving the card cancel the hold. Subsequent taps toggle
selection; a toolbar offers Select all/Clear selection, Delete selected and Done.
Deletion confirms exercise names and affected set counts, then uses one atomic
request. A failed save keeps the selection/confirmation. The original workout and
exercise library remain; only selected occurrences and their sets are removed.

Selection mode exposes pointer drag handles (touch/mouse). Drop saves a complete
order with its original-order snapshot; stale orders are rejected, and failures
leave the server-confirmed arrangement visible. Focused handles support Up/Down
keys. Right-click/Shift+F10 or Manage workout → Select exercises provide alternate
entry. Escape/Done exits selection. Finished sessions must be reopened first.

### Animated exercise drag feedback — 2026-10-22

Dragging lifts the exercise with a shadow and follows the pointer vertically.
Other cards project into their new slots with 180ms transitions using measured
heights and gaps, including uneven set counts. No request occurs while dragging.
Drop settles the dragged card, then the server-confirmed order replaces the
visual projection without a second jump. Failed saves animate back to the prior
order. Cancellation discards the projection without writes. Reduced-motion
preferences disable transitions. The existing atomic order/snapshot API is
unchanged; no new dependency or backend change.

### Comment workout shortcut — 2026-10-22

The workout overflow includes Comment workout after Edit workout. It opens a
focused notes editor prefilled with the existing session notes. Save patches only
`notes`; an empty comment clears them. Cancel does not save. Errors retain the
draft for retry. This uses the existing 2000-character session notes field and
contract; Edit workout still includes notes. No backend or route changes.

### Open-workout Move action — 2026-10-22

The open workout overflow now offers Move workout in place of Copy workout.
Its focused date picker patches only performed_on on the existing session, then
opens the destination day. IDs, exercises, sets, completion, notes and timing
remain intact; no duplicate session is created. The current date cannot be
submitted unchanged. Cancel does not save and a failed move retains the chosen
date. Copy previous remains available from the daily view, including empty days;
History still allows copying an explicitly selected historical session.
No API, route or backend changes.

### Training toolbar and set comments — 2026-10-22

The light exercise screen exposes an exercise switcher, rest timer, exercise stats
(existing records/statistics/goals overview), notes/defaults and overflow directly
in its top toolbar. Track / History / Graph and numeric Save/Clear controls remain
below it. The switcher opens a compact list of the current workout's exercises.
The exercise heading retains the full accessible name on narrow screens.

The mounted rest timer opens as a dialog from its toolbar shortcut and continues
counting after Close. Existing completion-triggered auto-start still uses the same
instance; it remains a visual timer. Saved set rows provide a comment button,
coloured when populated, which patches only comment and preserves completion and
values. Finished-session comments can be viewed but editing stays disabled. The
new comment dialog keeps failed drafts. Calculators and secondary tools remain in
overflow. No routes or backend contracts change.

### Training navigation panel — 2026-10-22

The exercise title opens a light side panel; a rightward swipe starting within
16px of the left edge also opens it. The panel shows workout exercises, total
saved set rows, the current exercise highlight and shared group colour bars.
Tapping a row switches the Training editor. Its footer offers Add exercise,
Add to group / Edit group and Home on the workout date.

Holding a row for 500ms lifts it for animated dragging; immediate handle dragging
and keyboard Up/Down remain available. The same atomic order/snapshot save and
rollback used by the workout overview applies. Cancellation causes no write.
The list scrolls independently of the footer. Escape, backdrop and Close dismiss
it; reduced-motion preferences disable the entrance animation.

Group actions reuse the existing picker/editor: generated Superset names,
automatic current membership, ten colours, adding members/library exercises,
joining, unlinking and confirmed deletion. Saving or cancelling returns to the
panel. Settings exposes the existing completion-only group auto-advance option;
its workout-order cycling behaviour is unchanged. Finished workouts allow
navigation but disable adding, grouping and ordering. No API or route changes.
