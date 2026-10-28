### 1.7 API Design

- Staging release correction (2026-10-18): POST captures the exact consented
  snapshot in the encrypted pending-job cache; the worker reuses it rather than
  rebuilding at execution time. Queue messages still contain identifiers only.
  Pending-job and broker expiry are one hour, independently of 110/120-second
  execution bounds and the 90-second provider timeout. Frontend polling matches
  the one-hour queue window. There are no AI daily caps or cooldowns. Each
  suggestion must cite at least one tracker with current or previous actual data.

- AI saved-review dates (2026-10-18): reviewed periods are the selected 1, 7 or 30 completed
  local dates, not the generation date or a Monday–Sunday calendar week. UI labels
  the saved period "Based on data" and timestamps "Generated". Timestamps use the
  saved review's IANA timezone and year-month-day format. Selecting saved history
  also selects its original tracker table and exact daily-summary JSON, so current
  data cannot be mistaken for that historical review's evidence. Route tests cover
  historical table/date alignment and generation near midnight in a different zone.

- Suggestions-only update (2026-10-17): current `weekly-v3` generation returns
  `review: {suggestions: [{text, evidence_keys}]}`. The prompt asks for three useful
  actions in 150–250 words total, each with a reason grounded in actual tracker
  records and a next-period check. It considers every tracker without generating a
  numerical recap. Validation requires 1–5 nonempty suggestions and known, distinct
  evidence keys. No app quota or cooldown is added. Existing saved v2 reviews show
  only their priorities; v1 shows its suggestion. Original saved payloads remain
  intact, with supporting numbers from their original snapshots. The existing
  tracker table, encrypted persistence and owner access rules are unchanged.

- Period selector (2026-10-18): migration `0014_weeklyaireview_timeframe` defaults
  existing saved reviews to `week`; legacy snapshots without `days` render as seven
  days. Selecting a period only fetches the data preview/history, without an LLM call.

## AI insights and personal NVIDIA keys — 2026-10-17

- UI refinement (2026-10-27): `/analytics/ai` presents a saved review after compact
  period/history/provider controls. New generation is a disclosed section when
  history exists and open for first use. Provider-key setup is prominent only when
  generation needs configuration; an available app key does not require a personal
  key. Saved evidence always uses that review's snapshot; the new-generation data
  preview uses the current completed-period snapshot. Both remain separately
  inspectable, including exact daily JSON. Client consent resets on model, period
  or preview changes, and stale/error previews cannot enable generation. Pending
  generation retains the saved result and locks its controls. Short date labels
  retain exact model/timestamp/timezone metadata under Review details. This changes
  presentation only: routes, request payloads, prompts and backend rules are unchanged.
- Frontend `/analytics/ai`, linked from Dashboard → Pro Insights, displays actual
  tracker summaries and an explicit Generate action. No production demo data or
  fabricated fallback review. Day uses yesterday, Week the last seven completed local dates, and Month the
  last 30 completed local dates, each compared with the preceding equal period.
  Browser supplies an IANA timezone; today is excluded.
- JWT + Pro `analytics_enabled`: GET `/api/v1/metrics/analytics/ai-weekly/`
  (`timezone`, default UTC; `timeframe=day|week|month`, default `week`) returns `{available,model,models:[{id,label}],snapshot,latest_review,review_history}` without calling an LLM.
  Snapshot includes timeframe/days/period/previous_period/timezone/prompt_version and evidence
  keyed by system metric or tracker. Each metric has label/unit/daily_method,
  current/previous `{observed_days,daily_average}`, absolute mean change, and 2, 14 or 60
  daily points. Missing measurements remain null; averages exclude missing days.
  Steps/sleep use existing preferred-source sums, other instantaneous metrics use
  medians; distance/total calories reuse platform-prioritized Health Connect
  aggregates. No raw competing writer totals are added to these aggregates.
- Recovery/diet/stretching contain daily logged-entry counts; workouts count only
  finished sessions, plus completed sets from both finished and unfinished sessions.
  Snapshot v2 includes bounded food/tool/stretch/exercise names and group/type labels,
  per-item current/previous counts and dates, configured catalog sizes, last logged
  dates and omitted-detail counts (20 items per tracker). Configured items are not
  prescribed daily targets. Workout details retain frozen type/units and separate
  kg/lb and km/mi; include recorded reps, load volume, max load, distance and time.
  Session metadata distinguishes unfinished records and known finished durations.
  Personal notes/comments, identity/profile fields, BMR and images are excluded.
  Check-offs do not establish nutrient intake or effects. Skin values remain baseline
  changes. Metrics also include observed-day range, first/last dated values and
  change across the selected window (historical JSON key `within_week_change`),
  with explicit dated minima/maxima; a single observation has no change.
- POST same path accepts `{timezone,consent:true,model?,timeframe?}`. Optional model must match
  the server allowlist (or trusted configured default); invalid values reject before
  queue. Options: `nvidia/nemotron-3.5-super-vl-120b-a12b`,
  `deepseek-ai/deepseek-v4.1-flash`, `z-ai/glm-5.3-flash`, and the existing
  `nvidia/nemotron-3-super-120b-a12b`. Omitted model preserves the backend default.
  UI selection lasts for the mounted page, is disabled during generation, and does
  not change a previous report's model label. Requires current data
  and a configured key. Timeframe uses the same allowlist/default as GET. Returns 202 `{job_id,status:"pending"}`; Celery receives
  only owner id/timezone/job id/validated model id; the worker reuses the exact
  encrypted snapshot captured by POST and calls NVIDIA.
  Poll GET same path with `job_id` and `timezone` returns `pending`, `ready`
  (with `result:{snapshot,review,generated_at,model}`), `failed` (safe detail), or
  `expired`. Job identifiers are UUIDs and reads are caller-scoped. Pending TTL
  one hour, ready/failed TTL one hour; cache payloads are encrypted. There is no
  permanent cache retention. Successful results are separately persisted in
  `WeeklyAiReview`: job UUID primary key, cascading owner FK, model/timezone/timeframe/period
  dates/generated_at metadata, encrypted JSON containing the original snapshot and
  report. `(user,-generated_at)` index serves history reads. Preview restores the
  newest saved success for the selected timeframe and returns owner-only metadata
  history for that timeframe; GET same path with
  `review_id` returns `{status:"ready",result}` or owner-safe 404. Successful result
  includes `id`; `job_id` reads fall back to the saved record after cache expiry.
  New successes append, failures leave history unchanged, duplicate task deliveries
  reuse existing saved results. The selected timeframe persists in the page URL. Changing it clears the displayed
  review and sharing checkbox. Refresh restores the newest success for that timeframe;
  in-progress request polling is still page-local. History selection preserves the
  original period/evidence while the generation preview remains current. Reports
  are included as decrypted `ai_weekly_reviews` in account export and cascade with
  deletion. No browser storage or automatic provider call is used for restoration.
- Generation has no application daily quota, cooldown or replacement concurrency
  limiter, per explicit user instruction. Legacy quota/cooldown Redis keys are
  ignored. Redis stores encrypted temporary job state; successful history is stored in PostgreSQL. Empty data/invalid
  inputs are 400, non-Pro 403, unavailable configuration/queue 503. NVIDIA's own
  provider-side quota/errors can still be returned. Provider network timeout 90s;
  worker soft/hard limits 110s/120s and broker expiry one hour keep calls off web workers.
- Backend-only fixed provider URL `https://integrate.api.nvidia.com/v1/chat/completions`,
  model from validated selection or backend `NVIDIA_INSIGHTS_MODEL` (fallback `nvidia/nemotron-3.5-super-vl-120b-a12b`),
  bounded output 8000 tokens and 128KiB
  response limit. Legacy `weekly-v2` output is JSON with `overview`, exactly six `sections`
  (`key,text,evidence_keys`, keys health/activity/workouts/diet/recovery/stretching),
  0–4 `connections` and 1–5 `priorities` (`text,evidence_keys`). Domain sections
  must cite their own evidence; absent-data sections are required. Connections
  require at least two distinct keys with current data. The legacy prompt targeted 350–500
  words total, all six domains and three practical suggestions, with aligned-date comparisons,
  explicit uncertainty and concrete next-week actions. All labels are untrusted data.
  Frontend keeps legacy v1 cached reports readable. Evidence shown with sections is
  server-computed; schema checks cannot prove the generated prose is correct.
- Historical timeout remediation (2026-10-17): the local/model example configuration used
  `nvidia/nemotron-3-super-120b-a12b`, verified then with a real weekly report. For that
  model and Nemotron 3.5 Super VL send `chat_template_kwargs:{enable_thinking:false}` and temperature 1.0,
  per NVIDIA documentation; statistical calculations already happen in the app.
  Reports and previews identify the configured model, with no silent provider
  fallback. DeepSeek remains selectable in backend configuration. HTTP 502/503/504
  errors explain upstream model unavailability without reflecting provider bodies.
  https://docs.api.nvidia.com/nim/reference/nvidia-nemotron-3-super-120b-a12b
- Model IDs verified against the live NVIDIA `/v1/models` catalog on 2026-10-17.
  Nemotron 3.5 produced a real six-section, 508-word review with three suggestions
  in 35.5s. Tiny DeepSeek and GLM connectivity checks timed out at 25s; this does
  not prove failure at the app's 90s bound. No silent fallback or free/unlimited
  usage promise; provider access/quota depends on the NVIDIA account.
- Reviews are independent one-request/one-reply calls. No prior review or chat
  messages are sent, and the encrypted temporary result cache is not conversation
  memory. NVIDIA chat completions can accept a message history; conversational and
  across-visit memory require an explicit app history feature, not added here.
  https://docs.api.nvidia.com/nim/reference/z-ai-glm-5-3-flash-infer
- Provider timeout diagnosis (follow-up): GLM defaults to reasoning_effort=max;
  requests now use `low`. DeepSeek V4.1 uses numeric reasoning effort 1 and
  temperature 1.0, retaining the configured model without fallback. In tiny streamed
  probes with those settings, Nemotron returned headers in 0.5s and content in 1.7s;
  GLM/DeepSeek produced no response headers before 45s. This rules out tracker-input
  size as a requirement for the stall, but does not identify provider-side queue,
  load or inference state. Timeouts identify the chosen model and retain saved reviews.
  https://docs.api.nvidia.com/nim/reference/z-ai-glm-5-3-flash
  https://docs.api.nvidia.com/nim/reference/nvidia-deepseek-v4_1-flash
- JWT on every plan: GET `/api/v1/metrics/analytics/ai-key/` returns only
  `{has_personal_key:boolean}`. PUT accepts only `{api_key:"nvapi-..."}` (12–512
  characters; NVIDIA token alphabet), encrypts under the existing PII key in
  `User.ai_api_key_encrypted`. DELETE clears it. Neither operation contacts NVIDIA
  or proves key validity. A personal key takes precedence over backend
  `NVIDIA_API_KEY`; invalid personal keys do not silently fall back. Removing a
  personal key restores the app fallback when configured. Responses never return
  the credential. `users.0005_user_ai_api_key_encrypted` adds the column.
- The UI has Save/Replace/Remove controls with a password input, no browser
  persistence, and clears the draft after successful saving. All successful AI
  responses use `private, no-store`. Personal keys are omitted from account exports
  and deleted with the user. Tests/E2E do not inherit the developer's provider key.
- Hosting caveat: NVIDIA catalog trial terms §§1.2/1.4 restrict production use;
  §4.3 restricts health-data uploads unless expressly permitted. User consent does
  not change those provider terms. Confirm a suitable service agreement before
  public deployment; the local integration is not deployment approval.
  https://assets.ngc.nvidia.com/products/api-catalog/legal/NVIDIA%20API%20Trial%20Terms%20of%20Service.pdf

## Respiratory rate and skin temperature change — 2026-10-17

- Shared active definitions: `respiratory_rate` (Respiratory Rate, breaths/min,
  respiratory, 0–1000) and `skin_temperature` (Skin Temperature Change, °C,
  biomarker, -30–30), seeded by `metrics.0012_respiratory_rate_skin_temperature`.
  These are ingestion bounds, not clinical reference ranges. Both also accept
  manual entries through the existing metric API; skin entries mean changes.
- Wearable ingestion accepts both slugs through the existing upload route.
  Android uploads `source:"health_connect"`, actual `source_package_name`,
  provider last-modified time and stable `health_connect:<record type>:<record id>`
  identity for any writer. Existing deduplication, mutable-record corrections,
  finite/range validation, CSV/account export and deletion behavior apply.
- RespiratoryRateRecord.rate becomes breaths/min at its measurement time.
  SkinTemperatureRecord becomes one normalized value: the arithmetic mean of
  its delta samples in Celsius, without adding or inventing a baseline. Empty
  records are skipped. Its timestamp is the exclusive record end minus 1 ns
  (stored at microsecond precision), attributing midnight endings to the prior day.
  This is a per-record summary; individual delta samples, optional absolute baseline
  and measurement location are not copied into MetricEntry. Original data remains
  in Health Connect. Skin temperature change is not absolute skin/core temperature.
  SDK reference: https://developer.android.com/reference/androidx/health/connect/client/records/SkinTemperatureRecord
- New authenticated GET routes `/api/v1/metrics/entries/daily-respiratory-rate/`
  and `/api/v1/metrics/entries/daily-skin-temperature/` return the existing daily
  entry shape with `local_date`, `period_start:null` and
  `context:{aggregation:"daily_median"}`. They share HRV's timezone, whole-date
  from/to filters, positive limit (maximum 366), active-system-definition and
  caller-only boundaries. Each day selects one source with existing precedence
  and a deterministic writer fallback, then computes its median; skin medians
  are medians of record means. No records from competing writers are combined.
- Dashboard and detail graphs use these daily endpoints, with at most one decimal
  in values/ticks. Raw history remains available. The Skin Temperature Change
  detail explains that the values are relative to the source baseline.

## Workout tracking backend — 2026-10-01

All routes require JWT and work on every plan. Basic UI integration is implemented
locally (2026-10-02), including direct routines, groups, rest timer, month calendar,
windowed/all-time progress, personal records and calculators. Advanced analysis remains future work.
See `47-workout-tracking.md`.

Workout duration (2026-10-03): existing session POST/GET/PATCH/list responses add
`duration_seconds` (nullable accumulated seconds, 0–604800), read-only
`timer_started_at`, computed `elapsed_seconds` and `timer_server_now` (server clock
calibration). Existing session PATCH accepts write-only `timer_action=start|pause`;
actions require an existing session and cannot accompany `duration_seconds`.
Start is explicit, repeat-safe and requires an open workout; pause accumulates
nonnegative whole seconds once and clears the timestamp. Finishing atomically
pauses; reopening never starts. Direct duration correction (including null to clear)
pauses and replaces the accumulated value, including on finished sessions. Running
totals saturate at 604800 seconds. Neither POST nor copy/routine start implicitly
starts timing. Copies/routine starts reset timing to null. Other session edits retain
timing state. The existing owner-locked PATCH protects actions from double counting;
manual corrections are last-write-wins, not a stale-version check. No new route.
Migration 0009 adds two nullable fields and bound/state SQL constraints. Account
JSON export includes stored duration/start; selected-workout CSV/text includes the
loaded elapsed snapshot and running status, not a restorable timing backup.

Timing timestamps (2026-10-21): session responses additionally expose nullable,
read-only `workout_started_at` (first explicit start since timing was cleared or
corrected) and `workout_ended_at` (latest actual pause/finish while running).
Resume preserves the first start and clears the end; repeated pause leaves it
unchanged. Manual duration replacement/clear nulls both timestamps because the
corrected total no longer describes the recorded wall-clock interval. Existing
rows remain null; the UI never invents historical times. Copies and routine starts
reset these fields; account JSON exports them. Migration 0012 adds the nullable
columns. PATCH ownership/locking and routes are unchanged. The UI's Stop timer
sends the existing `timer_action=pause`, so stopping does not finish the workout.

Frontend `/workouts` uses validated optional search fields: `view=home|exercises|
training|history|routines|calendar|progress|overview`, real calendar `date=YYYY-MM-DD`, UUID `session` and `exercise`.
Training needs both UUIDs; its exercise parameter identifies a session occurrence,
whereas History/Progress/Overview's optional exercise parameter identifies a library exercise.
These are UI state, not new REST contracts. Invalid training links fall back Home;
foreign/deleted UUIDs still rely on backend authorization and show read errors.
Date controls preserve the selected library exercise in History/Progress/Overview.
Calendar filters (2026-10-03) are client-side UI state over the existing fully
paginated month read. Exercise ID, saved category names, Any/All matching, training/planned status and
completed-set weight/reps conditions are not new session-list query parameters. Exercise/category criteria match the
same frozen occurrence; training means a completed set among matching entries,
not the Workout's finished flag. Opening/copying still uses the full session.
`view=exercises` without `session` is read-only browsing: exercise clicks open
library details with History/Progress links, never create a Workout. The All
exercises navigation tab clears session context. Start new workout explicitly
creates a session; session Add exercise passes its UUID to selection mode.
Selection reloads that owner-scoped session and opens a matching occurrence
(preferring one with sets), rather than POSTing a duplicate. Existing duplicate
rows are preserved; this is a frontend flow rule, not a new database uniqueness
constraint or a change to the occurrence-creation REST contract.
Overview and Training offer confirmed removal using the existing occurrence DELETE:
it removes that occurrence's sets, not the catalog exercise or other workouts.
Finished sessions must reopen first. Exercise history includes the current session,
marked explicitly, with one navigation link per other workout. Progress lists
exercise-specific planned-only dates excluded from its completed-only series.

### Routine templates — 2026-10-02

Routine start preview (2026-10-03): carry-forward is explicit and off by default.
Fixed values, including zero, stay fixed. Only blank quantities applicable to the
frozen type are filled from the latest matching exercise occurrence with completed
sets on a date strictly before `performed_on`. Type and both saved units must match.
Set positions match in saved order; missing/planned positions stay blank, without
falling back to older individual sets. Duplicate matching occurrences in the template
or source workout are ambiguous and remain blank with an explanation.

Preview JSON contains `day_id`, `name`, `notes`, `performed_on`, `carry_forward`,
`preview_token`, and nested template `exercises`. Each exercise adds `carry_reason`;
each set adds nullable `source: {workout_id, item_id, set_id, date, fields}` identifying
only filled quantities. No source comments/completion are exposed or copied.
`preview_token` is a SHA-256 fingerprint of the rendered plan, not authorization.
Carry-forward requires this token; any supplied token is compared to a recomputed
plan under the owner lock. Changed plans return `409` before any creation.
Selection uses `{item_id, set_ids?}` for template IDs, with the same 1–100 exercise,
0–1000 set, duplicate/foreign-ID validation as selective workout copying. Omitted
selection means all; omitted set IDs means all that item's sets; `[]` means exercise
only. Request order cannot change template order. New IDs/sets are independent,
planned and comment-free; day notes and groups are retained. No new schema or
persisted routine-to-workout occurrence lineage is introduced.

| Method | Endpoint | Contract |
|---|---|---|
| GET/POST | `/api/v1/workouts/routines/` | GET own routines including archives with nested days/exercises/sets; POST `{name, notes?, display_order?}` creates an active routine `201` |
| PATCH/DELETE | `/api/v1/workouts/routines/{uuid}/` | PATCH own name/notes/order/archive; DELETE `204` permanently removes only the template tree, preserving existing workouts |
| POST | `/api/v1/workouts/routines/{uuid}/copy/` | `{name}` creates an active independent deep copy with new template IDs, preserved notes/snapshots/groups/null quantities, and no Workout; archived sources allowed, `201` |
| POST | `/api/v1/workouts/routines/{uuid}/days/reorder/` | Atomic complete day order `{ids, expected_order}` |
| POST | `/api/v1/workouts/routine-days/{uuid}/exercises/reorder/` | Atomic complete exercise order `{ids, expected_order}` |
| POST | `/api/v1/workouts/routines/{uuid}/days/` | `{name, source_workout_id?, notes?, display_order?}`; `201` empty day, or independent snapshot of an own saved workout containing at least one exercise |
| PATCH/DELETE | `/api/v1/workouts/routine-days/{uuid}/` | PATCH own name/notes/order; optional `source_workout_id` atomically replaces exercise/set template; DELETE `204` removes only template, never previously created sessions |
| GET | `/api/v1/workouts/routine-days/{uuid}/preview/` | Required `performed_on`, optional `carry_forward=false`; read-only resolved start plan with provenance and `preview_token` |
| POST | `/api/v1/workouts/routine-days/{uuid}/start/` | `{performed_on, carry_forward?, preview_token?, selection?}` creates independent planned Workout `201`; legacy date-only starts retain fixed template behavior |
| POST | `/api/v1/workouts/routine-days/{uuid}/exercises/` | `{exercise_id, display_order?}` adds active own library exercise with server-frozen snapshots, `201` |
| PATCH/DELETE | `/api/v1/workouts/routine-exercises/{uuid}/` | PATCH `{display_order?, group_name?, group_colour?}` with at least one field; DELETE occurrence and its template sets, `204` |
| POST/PUT | `/api/v1/workouts/routine-exercises/{uuid}/sets/` | POST planned quantities and optional order, `201`; PUT atomic full preset draft `{sets, expected_sets}`, `200`; no performance fields |
| PATCH/DELETE | `/api/v1/workouts/routine-sets/{uuid}/` | Combined-value validation on partial quantity/order edits; DELETE `204` |

Routine JSON: `{id, name, notes, display_order, is_active, days}`. Day JSON:
`{id, name, notes, display_order, exercises}`. Exercise snapshots use the same
fields as session occurrences; template sets contain only
`{id, display_order, weight, reps, distance, duration_seconds}`, not performance
comments or completion. Nested templates remain read-only JSON; manage items through
the dedicated endpoints or replace them from a validated saved workout. Direct
editing creates no Workout rows. All quantities are optional but supplied values
must match the frozen exercise type. Empty days cannot start. Order appends by ten;
clients can explicitly set nonnegative order. Existing snapshots remain editable
after library archive; adding requires an active exercise/category.

Session and template exercise JSON additionally includes `group_name` (blank =
ungrouped, max 120 characters) and `group_colour` (six-digit hex, default `#007f68`). Exact matching trimmed labels within one workout
or routine day identify a superset/circuit. These are local labels, not cross-session
foreign keys. Capture/copy/start preserve them independently; changing order/group
cannot change references/type/units. No separate group table is introduced.
The UI defaults to cycling through same-group exercises in saved order after a
confirmed new completion; failed saves, edits to already-completed sets and plans
do not advance or start rest. Group auto-advance and timer auto-start are persisted account preferences; the running countdown remains temporary UI state.

Session sidebar Add to group / Edit group opens a picker and member editor.
New groups suggest the next unused `Superset N` name and include the selected
occurrence. Colour is selected explicitly; linked cards display a coloured bar.
The group editor uses an atomic API rather than sequential occurrence PATCHes:

| Method | Endpoint | Contract |
|---|---|---|
| PUT | `/api/v1/workouts/sessions/{uuid}/groups/` | `{name, colour, original_name?, member_ids?, add_exercise_ids?}` replaces membership; returns complete Workout `200` |
| DELETE | `/api/v1/workouts/sessions/{uuid}/groups/` | Body `{name}` unlinks group; retains every occurrence/set; returns Workout `200`; absent name is a no-op |

Names are trimmed, nonblank and case-sensitive within a session. Omit
`original_name` to create; supply it to edit/rename/join an existing group.
Missing original or a collision with another group returns `400`, not an implicit
merge. `colour` must match `#[0-9a-fA-F]{6}` and is stored lowercase. Each ID list
defaults empty, is unique and bounded to 100 items; at least one member/addition
is required. Existing IDs must belong to this session and owner, including archived
library snapshots. New library IDs must be active and owner-scoped; new occurrences
append in supplied order with server-frozen snapshots, no sets. All validation
precedes the atomic write. Selected existing occurrences may move from another
group; omitted old members become ungrouped. Removing the final member uses DELETE.
Finished sessions reject both methods until reopened; foreign session `404`,
foreign/nonsession members or library IDs `400`, unauthenticated `401`.
Colours are read-only in ordinary occurrence input; the legacy `group_name` PATCH
remains supported for template compatibility, but session UI no longer asks users
to type matching labels. Cancel never creates additions. Copy/capture/start/export
retain colours independently; group deletion does not remove exercises or sets.
Creation with library additions is not a blind retry contract: after an uncertain
response reload the workout before resubmitting, rather than creating duplicates.

Names max 120, instructions max 2000, order nonnegative; names are case-insensitive
unique per owner (routines, including archives) or per routine (days). Foreign
source references return `400`; foreign detail actions `404`; unauthorized `401`.
Restore archived routines before modifying/removing/starting days. Library archive
does not invalidate existing template snapshots. Start copies day instructions
to session notes, not routine metadata notes or source performance notes; its
combined routine/day session name is capped at 120 characters. No implicit type
or unit conversion occurs. Repeated Start POSTs create distinct sessions;
clients disable pending submissions and do not automatically retry POST writes.
Full account export adds `workout_routines`, `routine_days`, `routine_exercises`,
and `routine_sets`; account deletion cascades all four.

### Basic catalog and session contracts

Account workout preferences: authenticated `GET/PATCH /api/v1/workouts/preferences/` exposes `auto_start_rest` (default false), `auto_advance_groups` (true), `bar_kg` (20), `bar_lb` (45), and separate `plates_kg`/`plates_lb` inventories. GET (including catalog GET) returns defaults without creating rows. PATCH locks the owner before persisting validated changes. Bars accept 0–1000; inventories accept at most 20 distinct positive sizes up to 1000, with integer total counts 0–100. Inventories are explicit equipment defaults, not workout sets.

Catalog responses additionally include `preferences`. Exercises accept `is_favorite` and `default_graph` (an existing graph metric, `personal_records`, or blank for automatic). Read-only catalog hints `trained_session_count` and `last_used_on` count only owned sessions containing completed sets, not planned entries. Account export includes these library fields and owned `workout_preferences`. Migration `0007_workout_preferences` is additive; no logged set snapshots are rewritten.

Exercise responses also include read-only `can_delete`: true only when there are
no saved workout occurrences, routine occurrences or goals for the exercise.
Unlike training usage counts, this includes empty and planned occurrences and
archived routines. DELETE rechecks eligibility under the shared owner lock and
returns 409 with an Archive explanation if references now exist. Successful
deletion also removes matching exercise-specific bar preferences atomically;
it never deletes workouts, sets, routine templates or goals. Catalog computes
eligibility with Exists subqueries without per-exercise follow-up queries.

Category appearance (2026-10-23): category responses and POST/PATCH accept `colour`
as a six-digit `#RRGGBB` string. New categories receive an available palette colour
when omitted. Migration `0015_category_appearance` assigns initial colours per
owner without changing manual ranks or workout snapshots. Preferences GET/PATCH
includes `category_order` (`alphabetical` by default, or `manual`). GET still
creates no preferences row. Reordering locks the owner and compares the raw
catalog sequence before writing. Manual mode normalizes ranks to 10,20,30,...;
alphabetical mode preserves those ranks for switching back. Catalog category
order remains the raw saved sequence; clients sort names for alphabetical
display. Both colour and mode are included in account export.

| Method | Endpoint | Contract |
|---|---|---|
| GET | `/api/v1/workouts/catalog/` | `{categories, exercises, preferences}`, own catalog including archives; optional case-insensitive `search` (max 120 chars); does not seed |
| POST | `/api/v1/workouts/catalog/initialize/` | Empty body; owner-locked, once-only starter samples; returns catalog `200` |
| POST | `/api/v1/workouts/categories/` | `{name, display_order?, colour?}`; `201` active private category |
| PATCH | `/api/v1/workouts/categories/{uuid}/` | `{name?, display_order?, is_active?, colour?}`; own category |
| POST | `/api/v1/workouts/categories/reorder/` | `{mode, category_ids: UUID[], expected_order: UUID[]}`; mode alphabetical/manual; unique complete lists of all owned categories including archived, max 1000 IDs each; `200` catalog, stale order/membership `409`, invalid/foreign selection `400`; no partial writes |
| POST | `/api/v1/workouts/exercises/` | `{category_id, name, tracking_type, ...defaults}`; `201`, own active category |
| PATCH | `/api/v1/workouts/exercises/{uuid}/` | Editable library fields including category, type, units, notes, increments, rest and archive; never changes existing snapshots |
| DELETE | `/api/v1/workouts/exercises/{uuid}/` | Own unused exercise only; `204`; `409` if any workout occurrence, routine occurrence or goal references it; foreign/missing `404` |
| GET | `/api/v1/workouts/sessions/` | Required `date_from`, `date_to`, inclusive 1–366 days; optional own `exercise_id`; `{count, next, previous, results}`; limit default 25/max 100, offset default 0 |
| POST | `/api/v1/workouts/sessions/` | `{performed_on, name?, notes?, is_finished?}`; `201`; multiple sessions on a day allowed |
| GET/PATCH/DELETE | `/api/v1/workouts/sessions/{uuid}/` | Own detail; PATCH date/name/notes/is_finished; DELETE session and its sets `204` |
| POST | `/api/v1/workouts/sessions/{uuid}/exercises/` | `{exercise_id, display_order?}`; `201` ordered occurrence with server snapshots; active own exercise/category required |
| POST | `/api/v1/workouts/sessions/{uuid}/copy/` | `{performed_on, selection?}`; `201` independent planned session; no completion, session notes or performance comments copied |
| PATCH/DELETE | `/api/v1/workouts/session-exercises/{uuid}/` | PATCH `{display_order?, group_name?, group_colour?}` with at least one field; DELETE occurrence and sets `204`; snapshots/reference immutable |
| POST | `/api/v1/workouts/session-exercises/{uuid}/sets/` | Set fields below; `201` individual set; completion defaults true |
| PATCH/DELETE | `/api/v1/workouts/sets/{uuid}/` | Partial set edit validated against combined values, or DELETE `204` |
| POST | `/api/v1/workouts/sets/bulk/` | Atomic history update/delete of 1–100 sets with expected snapshots; `{affected_count}` `200` |
| POST | `/api/v1/workouts/session-exercises/{uuid}/move/` | `{direction: "up" \| "down"}` moves one occurrence adjacent in its workout; complete Workout `200` |
| POST | `/api/v1/workouts/sets/{uuid}/move/` | Same input; moves one set adjacent within its occurrence; complete Workout `200` |

Bulk history correction accepts `{action: "update" | "delete", sets:
[{id, expected}], changes?}`. IDs are unique set UUIDs; `expected` is the complete
unchanged Set JSON from a session read (including ID, order, comment and completion;
decimal strings retain their saved three-decimal representation). Selection is
1–100 rows, possibly across dates/occurrences. Update requires a nonempty shared
`changes` object containing only weight, reps, distance, duration_seconds, comment
or is_completed. Omitted fields stay unchanged; null clears a relevant optional
quantity, subject to combined-value validation. Delete does not accept changes.
Unknown outer/selection/change keys reject. Quantities share individual-set bounds
and frozen-type validation. Numeric edits require matching saved type and both
units across the selection; comment/completion-only edits and deletion may mix
partitions. No unit conversion, order/snapshot edits or automatic timer/group advance.

JWT and both workout/catalog ownership paths are checked under the shared owner
lock. Foreign, missing or deleted IDs return `404`; anonymous returns `401`;
invalid values/selections or any finished workout return `400`. Reopen finished
workouts first. Any expected-snapshot mismatch returns `409`; all rows are checked
and all combined updates validated before writing. The transaction changes all
selected rows or none, including across sessions. Delete removes selected sets
and their comments, retaining workouts/exercises/groups. Goals, records, statistics
and progress derive the corrected state on their next read. No schema change.

Training Exercise history and library Exercise overview → History share a
selection → before/after preview → explicit confirmation dialog. Only loaded
history is selectable; Select all caps at 100 editable sets. Finished rows are
visible but disabled. Blank numeric inputs mean leave unchanged; comment clearing
requires an explicit Replace comments checkbox. The dialog freezes reviewed rows
across refetches, disables all controls while pending, retains failed previews and
requires Refresh history/review before confirming again. Successful corrections
invalidate the private owner-scoped workout cache; no auto rest/advance from bulk
completion. This is snapshot-based stale protection, not an idempotency key or
ABA/version guarantee: if data changes and returns to identical values, it matches.
For an ambiguous network failure, refresh to inspect the saved state before retrying.

Selective copy accepts `selection: [{item_id, set_ids?}]`, with 1–100 unique source
occurrence UUIDs. Each optional `set_ids` contains at most 1000 unique UUIDs from
that occurrence; omitted means all its sets, `[]` means exercise only. Omitted
selection retains full-workout copy compatibility. Empty/null selection, wrong
or deleted occurrence/set IDs, duplicates and unknown input fields reject `400`
before any writes. UUIDs identify saved occurrences, not library exercises.
The owner lock covers validation and cloning, including source nested ownership;
foreign source workouts return `404`, anonymous requests `401`. Finished/archived
sources may copy their frozen snapshots. Response is a complete new Workout `201`,
never appended to another session. Source order, names/types/units, values and
group colours/membership are retained for chosen items; new IDs, planned state,
blank session notes/comments and open state are generated. A singleton group
retains its label but does not auto-advance. UI calendar, Home and History share
selection → read-only preview → explicit confirmation; cancel/browsing never writes,
and failed saves retain selection/date/preview for retry. No route or schema change.

Moves lock the owner in one transaction, using the current server order rather
than a stale client-side swap. Ordering is `(display_order, id)`; successful
non-boundary moves normalize sibling order to 10, 20, …, including ties. First-up
and last-down are no-ops. Only `direction` is accepted. Unauthorized requests
remain `401`, foreign targets `404`, invalid input/finished sessions `400`.
Reopen before moving. Snapshot fields, group membership, quantities, completion
and comments are unchanged. Existing numeric-order PATCH contracts remain.

Category JSON: `{id, name, display_order, is_active}`. Exercise adds
`category_id, tracking_type, weight_unit, distance_unit, notes, weight_increment,
rest_seconds`. Names max 120, notes/comments max 2000, order nonnegative.
Scoped case-insensitive duplicate names include archives. Units are `kg|lb` and
`km|mi`; increment is a positive decimal (3 places), rest is 0–3600 seconds.
New catalog rows are always active; category/ownership input cannot cross accounts.

Session JSON includes `id, performed_on, name, notes, is_finished, created_at,
completed_set_count, exercises`. Each occurrence includes `id, exercise_id,
exercise_name, group_name, group_colour, category_name, tracking_type, weight_unit, distance_unit,
display_order, sets`. Set JSON: `{id, display_order, weight, reps, distance,
duration_seconds, comment, is_completed}`. Decimal quantities serialize as strings
or null; weight/distance have 3 decimal places. Duration is integer seconds.

- `strength`: completed sets require nonnegative weight and positive integer reps.
- `bodyweight`: completed sets require positive integer reps; weight optional.
- `duration`: completed sets require positive integer duration_seconds.
- `cardio`: completed sets require positive distance and duration_seconds.
- Planned sets may omit relevant values. Irrelevant fields and invalid supplied
  values are rejected even for planned sets; unknown is null, not fake zero.
- Finished sessions must be reopened (`is_finished: false`) before modifying
  exercises/sets. Finishing does not mark planned sets completed. Only completed
  sets contribute to `completed_set_count`.
- Catalog archive does not block editing existing history or copying snapshots.
  Library deletion is limited to unreferenced exercises. Foreign detail access returns `404`, foreign
  creation references `400`, validation errors `400`. Session/exercise/set DELETE
  is not idempotent: subsequent deletion of an absent row returns `404`.
- Initialization is idempotent. Other POSTs create new resources on each request;
  clients must disable duplicate submission, not assume retry idempotency.
- Full account JSON includes `workout_catalog_state`, `exercise_categories`,
  `exercises`, `workouts`, `workout_exercises`, `workout_sets`, including archives.

### All-time exercise summaries — 2026-10-02

Exercise overview statistics: `GET /api/v1/workouts/exercises/{uuid}/stats/?date_to=YYYY-MM-DD` returns `{exercise_id,date_to,groups}`. Each frozen type/weight-unit/distance-unit group contains `session_count` (distinct workouts), `set_count`, `first_date`, `last_date`, `reps_total`, `volume_total`, `distance_total`, `duration_seconds_total`. Only completed sets through the inclusive cutoff count; unsupported totals are null. Volume means recorded load × reps (strength only), not body mass; decimal totals are strings with three places. SQL aggregates keep the raw history off the client. First/last dates are training dates, not catalog creation dates. No lower date bound or automatic conversion.

Exercise goals (strength in migration `0008`, metric targets in `0010`):

Metric extension (2026-10-05): the same POST accepts `{goal_type,target_value}`.
Bodyweight supports `reps`; cardio supports `distance`, `duration`, `max_speed`,
`best_pace`; timed exercises support `duration`. Strength payloads below stay valid.
Creation requires active exercise/category; PATCH of metric goals accepts only
`target_value`. Goal type, saved tracking type and both units are immutable, and
each goal compares only completed sets in that frozen partition through `date_to`.
Distance is saved km/mi, duration is seconds (at least, not a race-time maximum),
speed is saved distance/hour, pace is minutes per saved distance (at most/lower).
Reps goals allow optional recorded load without inventing body mass.
Targets have 3 decimal places: reps are integers 1–100000, duration integers
1–604800, distance/speed/pace .001–100000. API validates integer targets; SQL
constrains type/shape/bounds. Speed/pace require positive distance and seconds in
the same completed set; achievement compares unrounded rates, not display values.
GET adds `best_value` (also an alias of `best_weight` for strength), plus new goal
fields `goal_type,tracking_type,target_value`. Strength fields are null on metric
goals. Metric source includes recorded distance/duration alongside existing IDs.
Metric progress is best/target, except pace is target/best; it rounds to one decimal,
capped at 99.9 until achieved and 100 after achievement. No match yields null source/
best and zero progress. Stable earliest chronology wins ties; edits/deletion/
uncompletion recompute results. Existing 20-target cap, JWT scope, user lock,
account export/deletion and all-tier access remain. No route changes.
Pace editor saves preserve the original target when displayed minutes/seconds are
unchanged. Migration 0010 should not be reversed while metric goals exist: the
legacy nonnullable strength-only schema cannot represent them; use a coordinated
data/backup plan, not a blind downgrade.

Combined cardio extension (2026-10-05): the same POST also accepts
`{goal_type:"distance_time", target_distance, target_duration_seconds}` on an active
cardio exercise/category. Both targets are required: distance .001–100000 in the
saved km/mi (three decimal places), time limit 1–604800 whole seconds. PATCH accepts
either/both target fields, nonempty, retaining the other; kind/type/units cannot
change. Other target fields/null/unknown inputs reject. All older goal payloads
remain compatible. Responses/export add nullable `target_distance` and
`target_duration_seconds`; only combined goals populate these fields, with
`target_value,target_weight,target_reps` null. SQL constrains shape/type/bounds;
API enforces whole seconds. Migration `0011_combined_cardio_goals` adds these
nullable fields and updates the goal constraint without rewriting old goals/sets.
Do not blindly reverse 0011 while combined goals exist: 0010's constraint cannot
represent them; coordinate data/backup handling first.

Combined achievement requires distance ≥ target AND duration ≤ limit in the
same completed cardio set through the inclusive date cutoff, matching frozen
tracking type and both units. Incomplete/planned/foreign/future/other partitions
never count. There are no split times, summed sets, rate extrapolations or unit
conversions: 10 km in 50 minutes does not prove 5 km within 25 minutes.
For each eligible set, score = min(distance/target_distance, time_limit/duration).
The highest uncapped score chooses one supporting set; earliest stable chronology
wins ties. Display progress = score × 100, rounded to one decimal, capped at 99.9
until both raw thresholds are met, then 100. This is a bottleneck goal ratio, not
a fitness score or predicted race time. `best_value,best_weight` are null because
two dimensions cannot be expressed as one best quantity; inspect source's recorded
distance/duration. No source gives zero progress. Corrections, uncompletion and
deletion immediately recalculate; no permanent badge. Existing owner lock, 20-goal
cap, all-tier JWT ownership, export and cascade deletion apply. No new route.

| Method | Endpoint | Contract |
|---|---|---|
| GET/POST | `/api/v1/workouts/exercises/{uuid}/goals/` | GET requires `date_to`, returns up to 20 targets with progress; POST strength `{target_weight,target_reps,rep_rule?}`, metric `{goal_type,target_value}` or combined `{goal_type:"distance_time",target_distance,target_duration_seconds}` creates `201` on a compatible active exercise/category |
| PATCH/DELETE | `/api/v1/workouts/goals/{uuid}/` | PATCH strength weight/reps/rep rule, metric target value or either/both combined target fields; DELETE target only `204`, not recorded sets |

For strength targets, weights accept .001–10000 (3 decimals), reps 1–10000. `rep_rule=at_least` (default) means target reps or more; `exact` means exactly that count. Saved weight/distance units come from the library at creation and cannot be patched; unknown input fields reject. At most 20 goals per exercise, enforced inside the owner-locked creation transaction. Existing goals remain editable/readable after catalog archive/type/unit changes; creation requires an active compatible exercise. All routes require authentication and work on every tier; foreign IDs `404`, invalid input `400`.

Goal JSON: `{id,target_weight,target_reps,rep_rule,weight_unit,distance_unit,created_at}`. GET adds `achieved,best_weight,progress_percent,source,source_date`. Among completed strength sets through `date_to` matching the frozen units and rep rule, the highest actual load is the supporting lift (earliest stable source on ties). Achieved means that load meets/exceeds the target. `progress_percent` is qualifying load/target load capped at 100, not a fitness score or combined rep/weight percentage; without a qualifying lift best/source are null and percentage zero. It includes existing history, not only sets logged after goal creation. Changes/uncompletion/deletion of sets immediately recompute progress; achievement is not a permanent badge or immutable audit trail. GET is read-only. Account export includes `exercise_goals`; account deletion cascades owned goals.

Frontend Overview groups Statistics, bounded 90-day paginated History (including plans/comments), Graphs, all-time Records and Goals. Library/training provide Exercise overview buttons. The selected tracking date is the cutoff. History/source navigation uses the actual saved workout/occurrence UUIDs. Bodyweight/timed/cardio goals are implemented by the metric extension above. Pace uses minutes/seconds inputs converted to the API's three-decimal minutes; rate labels are rounded for display.

| Method | Endpoint | Contract |
|---|---|---|
| GET | `/api/v1/workouts/exercises/{uuid}/progress/` | Required `date_to`; optional `metric` (default `max_weight`), `reps` (default 5), `limit`, `offset`; paginated aggregate points and `types` |
| GET | `/api/v1/workouts/exercises/{uuid}/records/` | Required `date_to`; optional `history` (default false), `reps`, `weight_unit`, `distance_unit`, `limit`, `offset`; paginated best records or strict improvement history |

Both are authenticated, owner-only and available on every plan. Foreign/unknown
exercise UUIDs return `404`, unauthenticated reads `401`, invalid parameters `400`.
`date_to` is inclusive; there is no lower date bound. Only completed sets count,
including archived catalog history, partitioned by frozen tracking type and units.
Pagination defaults to 100 rows, allows 1–500, and requires nonnegative offset.
The UI requests summary pages of 500 and record-history pages of 25, constructing
its own same-origin paths instead of following response URLs.

Metrics: `max_weight`, `estimated_1rm`, `max_reps`, `max_volume`,
`max_weight_reps`, `workout_volume`, `workout_reps`, `max_distance`, `max_duration`,
`max_speed`, `best_pace`.
Cardio rates require completed cardio snapshots with positive distance and duration
in the same set. `max_speed` = distance × 3600 / duration_seconds (km/h or mi/h);
`best_pace` = duration_seconds / (distance × 60) (decimal min/km or min/mi).
Values round to three decimal places. Daily selection takes maximum speed or minimum
pace in each frozen type/unit partition, with the existing stable source tie order.
These are individual-set rates, not summed ratios or workout-average speeds.
Missing quantities, plans, other types and future dates never contribute.
Source JSON is unchanged; its workout/item/set IDs allow inspection of recorded
distance/time. Both metrics can be saved as `default_graph` via existing exercise
PATCH. No route, schema or automatic unit conversion changes.
`reps` accepts 1–10000 and only affects `max_weight_reps`. Daily extrema select one
source set per date/type/unit partition; workout totals retain separate sessions
and sum this exercise's occurrences. Estimated 1RM uses Epley, positive load up to
10000 and 1–10 reps, rounded to three decimals; a one-rep set returns its load.
The `types` list includes all completed saved types through that date, independent
of the selected metric. The Personal records graph uses the records endpoint.

Progress rows: `{date, tracking_type, weight_unit, distance_unit, value, source}`;
`value` is a decimal string. Source is `{workout_id, item_id, set_id, weight, reps}`;
totals have `source:null` plus `workout_id` and `session` name. Record rows add `reps`
and always carry the source set. Bests are strongest recorded load per strength
rep count/type/unit partition, retaining the earliest source on ties. `history=true`
returns the first qualifying set and subsequent strictly higher loads in stable
date/session-creation/exercise/set order; ties are not improvements. Optional
rep/unit filters narrow the records. Editing, deleting, or uncompleting sets
recomputes records/history: this is not an immutable audit trail or a cached PR model.
SQL aggregation/window functions avoid loading raw workout histories in Python or
the browser. No migration or automatic unit conversion is introduced.

Calendar reads the displayed month through the existing bounded, safely paginated
session API. Month and List share that bounded read, filters and matching-session
count. Previous/next matching workout-day navigation is restricted to the displayed
month. Inspection highlights a local date without changing Home's working date;
Go to workout explicitly navigates. Month browsing/jump retains the existing
`view=calendar&date=YYYY-MM-DD` route, with no new query parameters.
Category All requires category presence within one session. Weight/reps predicates
must match the same completed strength/bodyweight set and its frozen weight unit;
unknown values never become zero. No automatic kg/lb conversion. Previews retain
full original sessions. Display mode, dots, category labels, list set details and
the optional wide-screen panel are owner-keyed device preferences, not API fields.
Windowed progress reads 30/90/180/365 days ending on the selected date
with the owned library `exercise_id` filter. The browser derives daily maxima/
observed records from completed sets only and partitions frozen type/unit
combinations. All time uses the summary endpoints above, not expanded raw session
reads. Writes invalidate these owner-scoped reads. Calculators run locally: Epley estimated max, percentage/nearest
increment, and exact balanced plates from explicit finite inventory. Adding a
percentage result uses the existing set POST with `is_completed:false`, unknown
reps, and saved units. Calculation inputs are temporary; bar/plate inventory can
be explicitly saved as unit-specific account defaults. No automatic unit conversion or health score.

## Diet tracking (implemented locally, 2026-10-01)

All routes require JWT and are available on every plan. No seeded sections/foods.
See `46-diet-tracking.md` for ownership, archive and calendar-day rules.

| Method | Endpoint | Contract |
|---|---|---|
| GET | `/api/v1/diet/catalog/` | `{sections: [...], foods: [...]}`; own catalog including archives |
| POST | `/api/v1/diet/sections/` | `{name, display_order?}`; `201` owned active section |
| PATCH | `/api/v1/diet/sections/{uuid}/` | Own section: name, display_order, is_active |
| POST | `/api/v1/diet/foods/` | `{section_id, name, display_order?}`; `201` food under own active section |
| PATCH | `/api/v1/diet/foods/{uuid}/` | Own food: name, display_order, is_active; section cannot change |
| GET | `/api/v1/diet/entries/?date_from=YYYY-MM-DD&date_to=YYYY-MM-DD` | Own entries, inclusive 1–366-day range; invalid/missing bounds `400` |
| PUT | `/api/v1/diet/entries/{food_uuid}/{YYYY-MM-DD}/` | Empty body; idempotent check-off `200`; archived food/section `400`, inaccessible food `404` |
| DELETE | `/api/v1/diet/entries/{food_uuid}/{YYYY-MM-DD}/` | Idempotent undo including archived foods, `204`; inaccessible food `404` |

Section JSON: `{id, name, display_order, is_active}`. Food adds `section_id`.
Entry JSON: `{id, food_id, performed_on, created_at}`. Names max 120 characters;
nonnegative order; case-insensitive scoped duplicates return `400`, including
archived rows. Foreign-section creation returns `400`; foreign detail edits `404`.
Authenticated ownership is not client-writable. Account JSON export includes
Diet archives/history; user deletion cascades owned Diet data.

## Recovery tracking (implemented locally, 2026-09-30)

All routes require JWT; see `45-recovery-tracking.md` for evidence and access rules.

| Method | Endpoint | Contract |
|---|---|---|
| GET | `/api/v1/recovery/tools/` | `{tools: [...], can_create_custom: bool}`; shared and own tools, including archived; custom evidence is null |
| POST | `/api/v1/recovery/tools/` | Pro only; `{name, description?}`; `201` private tool; `403` for Free |
| PATCH | `/api/v1/recovery/tools/{uuid}/` | Owner-only custom tool; name, description, is_active; archive/restore retains history |
| GET | `/api/v1/recovery/entries/?date_from=YYYY-MM-DD&date_to=YYYY-MM-DD` | Own entries, inclusive 1–366-day range; `400` for missing/invalid bounds |
| PUT | `/api/v1/recovery/entries/{tool_uuid}/{YYYY-MM-DD}/` | Empty body; idempotent daily check-off, `200`; archived tool `400`, inaccessible tool `404` |
| DELETE | `/api/v1/recovery/entries/{tool_uuid}/{YYYY-MM-DD}/` | Idempotent undo, `204`; inaccessible tool `404` |

Entry JSON: `{id, tool_id, performed_on, created_at}`. Tool JSON:
`{id, name, description, is_active, is_custom, evidence}`; shared evidence includes
`outcome, smd, ci_lower, ci_upper, subjects, experimental_groups, citation, source_url`.
Ownership, slug, order and evidence are not client-writable. Existing custom tools
remain usable after downgrade. Full account JSON export adds recovery sections;
account deletion removes owned recovery data through database cascades.

## Stretching & posture tracking (implemented locally, 2026-10-13)

All routes require JWT. The starter catalog remains shared and read-only, while
visibility preferences are private to the authenticated account. Hidden exercises
remain in the catalog response with `is_visible: false` so they can be restored;
preferences do not delete catalog rows or past check-offs. Users may also create
private stretches. Custom stretches and their images are owner-scoped; deleting a
custom stretch archives it so past check-offs remain readable. Exercise names and
cues are not medical instructions.

| Method | Endpoint | Contract |
|---|---|---|
| GET/POST | `/api/v1/stretching/exercises/` | GET returns active shared exercises plus all own custom stretches (including archived for management), grouped by phase. Exercise objects include `is_custom`, `is_active`, `image_url`, and account-specific `is_visible`. POST creates an own custom stretch with `{phase, name, description?, dosage?, image?}`; JSON or multipart; `201` |
| PATCH/DELETE | `/api/v1/stretching/exercises/{exercise_uuid}/` | Own custom exercises only; PATCH edits `phase`, `name`, `description`, `dosage`, optional `image`, `remove_image`, or `is_active` (restore). DELETE archives (`204`) and keeps check-off history. Shared or foreign IDs return `404` |
| GET | `/api/v1/stretching/exercises/{exercise_uuid}/image/` | Authenticated owner-only WebP image stream; foreign/shared IDs and stretches without an image return `404`. Responses are `private, no-store` and are not presigned bearer links |
| GET | `/api/v1/stretching/preferences/` | `{show_shared_exercises, hidden_exercise_ids}`; defaults to `true` and `[]` |
| PATCH | `/api/v1/stretching/preferences/` | Partial update; `show_shared_exercises: boolean` hides/restores all shared exercises, `hidden_exercise_ids: uuid[]` replaces the individually hidden list; IDs must be existing shared exercises |
| GET | `/api/v1/stretching/entries/?date_from=YYYY-MM-DD&date_to=YYYY-MM-DD` | Own entries, inclusive 1–366-day range; invalid/missing bounds `400` |
| PUT | `/api/v1/stretching/entries/{exercise_uuid}/{YYYY-MM-DD}/` | Empty body; idempotent daily check-off `200`; unknown/inactive exercise `404` |
| DELETE | `/api/v1/stretching/entries/{exercise_uuid}/{YYYY-MM-DD}/` | Idempotent undo `204`; unknown exercise `404` |

Entry JSON: `{id, exercise_id, performed_on, created_at}`. Client-supplied owner,
slug, order, image key, and timestamps are not accepted. Images are limited to 2 MB
JPEG/PNG/WebP uploads, normalized to 640×480 WebP, stored in private object storage,
and read through the authenticated owner-only image endpoint. `STRETCH_IMAGE_BUCKET` must be configured
for production uploads; absent storage yields `503` for image writes while text-only
custom stretches remain available. Account export includes custom stretch metadata,
entries and visibility preferences; account deletion cascades rows and removes
associated image objects after commit.

## Use When
- Load this when you need the api design.

## Source
- Derived from `reference_docs/knowledge/planning.md` sections 1.7.

**Protocol: REST.** Standard CRUD operations over HTTP, resources map directly to our entities. No reason to use GraphQL (we don't have complex nested queries or multiple client types with different data needs) or gRPC (no microservices, no internal service-to-service calls). REST is well-understood, has great Django/DRF tooling, and covers 100% of our use cases.

**Versioning:** URL-based (`/api/v1/`). Explicit, easy to test, easy to route.

**Auth:** The current backend auth implementation is split by client transport. Mobile auth uses explicit JWT token submission. Web auth uses JWT access tokens plus cookie-based refresh/logout with CSRF. Password-reset requests are limited to 3/hour per client per application worker; presentation staging's two process-local workers can therefore allow up to 6/hour. Login still needs its planned 5 attempts/minute limit.

#### Operations (public — no JWT required)
| Method | Endpoint | Description | Notes |
|---|---|---|---|
| GET | `/api/v1/health/live/` | Process liveness | Returns `200 {"status": "ok"}` without querying PostgreSQL or optional services; external uptime-monitor contract |
| GET | `/api/v1/health/ready/` | Application readiness | Executes `SELECT 1` through Django's default database; returns `200 {"status": "ok"}` or redacted `503 {"status": "unavailable"}`; ALB target-health contract |

The removed legacy `/health/` route returns `404`. Readiness deliberately does
not depend on Redis or Celery because they are absent from the approved initial
staging runtime.

The former unauthenticated `GET /tasks/ping/` diagnostic is also removed and
returns `404`. Public HTTP routes must not enqueue infrastructure-test tasks;
future operational Celery diagnostics belong in protected commands or internal
deployment checks.

#### Auth (public — no JWT required)
| Method | Endpoint | Description | Notes |
|---|---|---|---|
| POST | `/api/auth/register/` | User registration | Returns 201; atomically creates the user and an active subscription to the seeded free plan |
| GET | `/api/auth/csrf/` | Issue CSRF cookie for SPA bootstrap | Web clients call this before cookie-based refresh/logout |
| POST | `/api/auth/web/login/` | Web login | Returns `access` only in JSON and sets the refresh token in an `HttpOnly` cookie |
| POST | `/api/auth/web/refresh/` | Web refresh | Cookie-only and CSRF-protected; returns `access` only in JSON and rotates the refresh token exclusively through an `HttpOnly` cookie |
| POST | `/api/auth/web/logout/` | Web logout | Cookie-only, CSRF-protected, blacklists refresh token |
| POST | `/api/auth/mobile/login/` | Mobile login | Returns access + refresh tokens in JSON |
| POST | `/api/auth/mobile/refresh/` | Mobile refresh | Refresh token supplied explicitly in request body |
| POST | `/api/auth/mobile/logout/` | Mobile logout | Refresh token supplied explicitly in request body |
| POST | `/api/auth/password/request/` | Request password-reset email | Always returns generic `202` for syntactically valid emails and sends only for an active matching account; current process-local throttle is 3/hour per client per worker |
| POST | `/api/auth/password/confirm/` | Confirm password reset | Implemented locally; accepts `uid`, `token`, and `new_password`; returns `204`, applies Django password validation, and revokes outstanding refresh tokens |

Password-reset links use Django's signed, expiring, password-state-bound token.
They become invalid after a successful reset. Local development prints reset
emails to the backend console. Production settings send through Amazon SES in
`eu-central-1` as `no-reply@syncvitals.space`, using the EC2 instance role's
short-lived credentials. A provider failure is logged without the recipient
address and still returns the same generic `202` response used for an unknown
account.

Refresh concurrency behavior:
- web-cookie and mobile-body refresh use the same transactional rotation service;
- the service validates the signed refresh token, locks its SimpleJWT `OutstandingToken` row, and performs blacklist validation plus rotation while holding that PostgreSQL lock;
- two concurrent requests presenting the same refresh token cannot both rotate it: exactly one returns `200` with replacement credentials appropriate to its client transport and the waiting replay returns `401` with `{"detail": "Token is invalid."}`;
- different outstanding refresh tokens lock different rows and can still rotate concurrently.

#### Testing (E2E runtime only)
| Method | Endpoint | Description | Notes |
|---|---|---|---|
| POST | `/api/testing/reset/` | Reset the isolated E2E database | Only mounted when `ENABLE_E2E_TESTING_API=True` through `config.settings.e2e`; flushes mutable E2E state, then restores required system seed rows such as default metric definitions; never expose in dev/prod |

#### User & Profile (JWT required)
| Method | Endpoint | Description | Notes |
|---|---|---|---|
| GET | `/api/auth/me/` | Current user email | Implemented; unchanged authentication bootstrap contract |
| GET | `/api/v1/me/` | Personal info and current estimated BMR | Implemented locally; owner-only, every plan, `Cache-Control: no-store` |
| PATCH | `/api/v1/me/` | Update personal info (partial) | Implemented locally; optional nullable `date_of_birth`, `sex`, `height_cm`; returns the same representation as GET |
| GET | `/api/v1/me/export/` | Account-wide app data export | Implemented locally; streams a `200` JSON attachment on every plan, not an asynchronous job |
| DELETE | `/api/v1/me/` | Delete account and live app data | Implemented locally; confirms immediate Stripe cancellation first; requires current password; returns `204` and invalidates sessions |

Personal info and estimated BMR (2026-10-16, local):
- GET/PATCH return `{date_of_birth,sex,height_cm,age,estimated_bmr}`. Date of birth
  is an ISO date, nonfuture and within 120 calendar years; sex is `male`, `female`
  or null (the formula coefficient, optional); height is finite centimetres from
  50 through 250. Unknown input fields reject with `400`; nullable fields can be
  cleared individually. PATCH merges omitted fields under the account row lock
  used by deletion. Reads do not persist defaults or calculated entries.
- `age` is completed years on the server's current UTC date. `estimated_bmr`
  contains `{value,unit:"kcal/day",formula:"mifflin_st_jeor",missing_fields,reason,weight}`.
  `weight` is null or `{value,recorded_at,source,entry_id}` from the latest
  caller-owned active system `body_weight` definition in kg, ordered by
  `recorded_at DESC,id DESC`, excluding future readings and custom definitions.
- The whole-kcal estimate is `10*kg + 6.25*cm - 5*age + coefficient`, with +5 for
  male and -161 for female; no activity multiplier. Missing inputs return null
  with `reason:"missing_information"` and required field names (including
  `body_weight`). Fully supplied profiles under 18 return `adult_only`;
  nonfinite/out-of-range weight (20–400 kg) returns `invalid_weight`
  (nonfinite supporting weights are omitted to preserve valid JSON). Nonpositive
  results return `invalid_inputs`. Otherwise reason is null and missing fields []
  (Python's nearest-integer rounding). The original study included ages 19–78;
  this feature estimates adult resting energy, not measured BMR or a calorie goal.
  Formula source: [Mifflin et al., 1990](https://pubmed.ncbi.nlm.nih.gov/2305711/).
- Settings → Personal info saves/clears details and displays the estimate.
  Dashboard includes a separate Estimated BMR card, with formula and supporting
  weight date/source. The estimate recalculates on read after profile/weight
  changes or birthdays; frontend entry mutations invalidate its query and an
  active page refreshes it every minute for phone syncs. No stale-weight cutoff
  is imposed; the weight date remains visible. Missing data links to Settings
  and Body Weight. It creates no MetricEntry rows, does not affect Total Calories
  Burned, and does not write to Health Connect.
- All three fields are stored together as encrypted JSON in
  `User.personal_info_encrypted` using the existing Fernet PII key. Account JSON
  export adds plaintext `profile.personal_info` with the three nullable fields,
  excluding ciphertext; deletion removes them with the user. Migration
  `users.0004_user_personal_info_encrypted` is additive, with empty existing profiles.

Account lifecycle checkpoint — 2026-09-30 (local, not deployed):
- Settings offers **Download account data** independently of the Pro CSV export.
  `syncvitals-account.json` has `schema_version=1`, an export timestamp, profile
  and sleep preference, owned custom definitions (including archived ones),
  definitions referenced by owned entries, full raw metric history and provenance,
  wearable connections, sync receipts, local billing and checkout history, and
  session creation/expiration dates. Every section is caller-scoped; query-string
  user IDs cannot select another account. Password hashes, lookup hashes,
  JWT credentials, and global webhook receipts are excluded.
- JSON is formatted with indentation and line breaks so editors do not have to
  render the entire archive as one enormous line. Raw readings remain complete;
  dashboard daily aggregation does not discard samples from this archive.
- Export uses bounded database iteration and `Cache-Control: no-store`; it has
  a per-user limit of three requests/hour in each worker's local cache. It is
  a live streamed read, not a transactionally frozen snapshot. Avoid simultaneous
  edits/sync during export when an exact point-in-time copy is needed. Large
  asynchronous archive generation remains a later measured need.
- `DELETE` accepts JSON `{"password":"current password"}` with bearer auth.
  Password validation happens under the user-row lock; missing/incorrect passwords
  return `400` without deleting data. The UI also requires an explicit checkbox.
  Deletion erases owned metric entries before protected custom definitions,
  checkout attempts before protected subscriptions, and outstanding refresh tokens
  before deleting the user and cascading remaining owned data. It clears the web
  refresh cookie; subsequent access/refresh requests fail with `401`. A repeated
  request using the deleted account's token therefore returns `401`, not `204`.
- Account deletion expires open Stripe checkout links and cancels all nonterminal
  subscriptions immediately. It resolves locally known subscription IDs and
  completed checkouts whose webhooks have not arrived, then checks every page of
  customer subscriptions with `status=all`. Ownership and terminal provider
  responses are checked before any local data is deleted. Cancellation sends
  `invoice_now=false` and `prorate=false`; it does not issue a refund automatically.
  Ordinary subscription cancellation through the Portal remains a separate flow.
- Historical customer IDs are accepted only from saved Checkout sessions whose
  `client_reference_id` matches the deleting user. This handles repeated paid
  checkouts before webhook delivery persisted a customer mapping. A customer
  mapped to another local user is rejected, and each checkout's subscription
  must belong to that exact customer. Every proven customer is scanned for all
  subscriptions; the current `BillingCustomer` mapping is not replaced.
- Provider failure, mismatched ownership, or unconfirmed cancellation returns a
  redacted `502` and rolls back local deletion. Stripe mutations already completed
  cannot be rolled back: a retry reads current remote state and skips canceled or
  incomplete-expired subscriptions rather than cancelling them twice. A pending,
  failed, or completed checkout without a saved Stripe receipt returns `409` and
  requires billing verification; an active Stripe row without a subscription ID
  also prevents deletion. Deletion attempts retain the per-user five/hour limit.
- Checkout creation shares the user-row lock with deletion until its receipt is
  saved. Failed attempts commit before the provider exception is re-raised, and
  a session ID is saved even when Stripe returns no redirect URL. Webhooks ignore
  deleted owners, and subscription-update handlers re-read under that same lock
  so delayed events cannot recreate account data.
- These endpoints operate on the live application database. Existing backups,
  source-app/Health Connect records, and external Stripe records are not erased.
  Provider archives and deletion-aware backup restoration need
  separate handling before describing this slice as a complete privacy lifecycle.

#### Metrics (JWT required)
| Method | Endpoint | Description | Notes |
|---|---|---|---|
| GET | `/api/v1/metrics/definitions/` | List available metrics | Implemented; includes active defaults (including the `steps` activity metric) + authenticated user's active custom definitions; optional `include_inactive=true` also includes the authenticated user's inactive custom definitions |
| POST | `/api/v1/metrics/definitions/` | Create custom metric | Implemented for authenticated users; creates user-owned non-default metric definitions |
| PATCH | `/api/v1/metrics/definitions/{id}/` | Update custom metric | Implemented for authenticated user's own custom metric definitions, including inactive ones for reactivation; slug is immutable |
| GET | `/api/v1/metrics/usage/` | Read metric entitlement usage | Implemented; returns the authenticated user's active custom metric count and current limit |
| GET | `/api/v1/metrics/entries/?metric=resting_hr&from=2026-01-01&to=2026-03-01&limit=50` | Query entries | Implemented for authenticated user's entries; supports optional `metric`, `from`, `to`, and positive integer `limit` filters; returns newest first |
| POST | `/api/v1/metrics/entries/` | Log a metric entry | Implemented for manual entries; accepts `metric_definition` as a slug such as `resting_hr`; not idempotent — repeated calls create duplicate entries |
| PATCH | `/api/v1/metrics/entries/{id}/` | Update a metric entry | Implemented for authenticated user's own manual entries; synced/imported entries are immutable and return `409`; value range validation still applies |
| DELETE | `/api/v1/metrics/entries/{id}/` | Delete a metric entry | Implemented for authenticated user's own manual entries; returns `204` on success; synced/imported entries return `409` |
| GET | `/api/v1/metrics/entries/export/` | Export metric entries as CSV | Implemented locally for authenticated users whose current plan has `csv_export_enabled=true`; optional `metric`, `from`, and `to` filters narrow caller-owned rows; Free receives `403` |
| GET | `/api/v1/metrics/preferences/sleep/` | Read saved Sleep target | Implemented for authenticated users; returns the caller's account-level `target_minutes`, defaulting to `450` |
| PATCH | `/api/v1/metrics/preferences/sleep/` | Save Sleep target | Implemented for authenticated users; accepts `target_minutes` as a whole number from `60` through `1439` and updates only the caller's account |
| GET | `/api/v1/metrics/analytics/weight-steps/?days=30` | Body Weight and Steps comparison | Implemented locally for authenticated users whose current plan has `analytics_enabled=true`; `days` defaults to `30` and accepts only `7`, `30`, or `90`; returns complete UTC calendar-day rows with daily latest weight, seven-day rolling weight average, and daily summed steps for the authenticated user |
| GET | `/api/v1/metrics/analytics/sleep/?target_minutes=450` | Seven-night Sleep insights | Implemented locally for authenticated users whose current plan has `analytics_enabled=true`; returns seven complete UTC wake-date rows, daily-latest Sleep intervals, coverage, factual aggregates, and an estimated shortfall against a target from `60` through `1439` whole minutes |
| GET | `/api/v1/metrics/analytics/consistency/` | Seven-day consistency and coverage | Implemented locally for authenticated users whose current plan has `analytics_enabled=true`; returns seven UTC dates, active metric definitions, per-day entry presence, a seven-day-bounded current streak, latest entry timestamps, and factual coverage summaries |
| POST | `/api/v1/metrics/entries/bulk/` | Bulk import | |
| GET | `/api/v1/metrics/analytics/{slug}/?range=30d` | Analytics for one metric | `slug` is required (path param), `range` is optional (query param, default 30d) |

**Pagination (cursor-based for entries):**
```json
GET /api/v1/metrics/entries/?metric=resting_hr&limit=20

{
  "results": [
    {"id": 984312, "value": 58, "recorded_at": "2026-03-05T07:15:00Z", "source": "samsung_health"},
    ...
  ],
  "next_cursor": "eyJyZWNvcmRlZF9hdCI6ICIyMDI2LTAzLTA1VDA3OjE1OjAwWiIsICJpZCI6IDk4NDMxMn0=",
  "has_more": true
}

// Next page:
GET /api/v1/metrics/entries/?metric=resting_hr&cursor=eyJyZWNvcmRlZF9hdCI6ICIyMDI2LTAzLTA1VDA3OjE1OjAwWiIsICJpZCI6IDk4NDMxMn0=&limit=20
```
Cursor-based (not offset-based) because metric entries are time-series data — new entries are constantly added, and offset pagination would cause duplicates/gaps. Results are ordered by `recorded_at DESC, id DESC`, and the cursor encodes both values so backfills and out-of-order inserts don't skip or duplicate rows.

Current entry listing behavior:
- `GET /api/v1/metrics/entries/` returns only the authenticated user's entries.
- Results are ordered by `recorded_at DESC, id DESC`.
- Every serialized entry includes nullable `period_start`. Interval
  metrics use it as the interval beginning; instantaneous entries return `null`.
  `recorded_at` remains the interval end for Sleep and Steps.
- `metric=<slug>` filters by metric definition slug, for example `metric=resting_hr`.
- `from=<timestamp>` filters entries where `recorded_at >= from`.
- `to=<timestamp>` filters entries where `recorded_at <= to`.
- `limit=<positive integer>` caps returned entries. If omitted, the backend applies the current default limit of `50`.
- Invalid limits such as `0`, negative values, or non-numeric values return `400`.
- Cursor pagination is still planned; the current implementation supports a single bounded result set but does not yet return `next_cursor` or `has_more`.

Current metric-entry CSV export behavior:
- `GET /api/v1/metrics/entries/export/` requires bearer authentication and
  streams only the authenticated user's entries as
  `syncvitals-metrics.csv`.
- Optional `metric=<slug>`, `from=<timestamp>`, and `to=<timestamp>` filters
  are cumulative. Invalid date-time filters return `400` rather than reaching
  the database as malformed values.
- Rows are ordered by `recorded_at ASC, id ASC` and include `entry_id`, metric
  slug/name, value, unit, nullable `period_start`, `recorded_at`, source,
  JSON-encoded context, and `created_at`. Sleep rows therefore preserve their
  bedtime and wake-time bounds.
- The response uses a streaming iterator with a database chunk size of 1,000,
  so the server does not assemble the complete history in memory.
- User-controlled metric names and units that could be interpreted as
  spreadsheet formulas are prefixed with an apostrophe in the CSV.
- The server enforces the current plan's `csv_export_enabled` entitlement.
  The canonical Free plan disables it and Pro enables it; unauthorized plan
  access returns `403` with a safe detail message. `csv_import_enabled` remains
  a separate entitlement.

Current Weight × Steps analytics behavior:
- The server enforces the current subscription's `analytics_enabled`
  entitlement; Free requests return `403` with a safe detail message.
- The query is always scoped to the authenticated user and the requested UTC
  date window. It includes only the system-owned default Body Weight and Steps
  definitions; same-slug custom metrics and future-dated entries are excluded.
- Multiple Body Weight entries on one UTC day collapse to the latest recorded
  value. Multiple Steps entries on one UTC day are summed.
- `series` contains every UTC calendar date in the selected range so the chart
  cannot compress gaps. `weight_kg` and `steps` are `null` when that raw metric
  has no observation on the date.
- `weight_7d_average_kg` is the mean of available daily-latest Body Weight
  values on that date and the preceding six UTC dates. It does not invent
  measurements for missing dates. The query reads six days before the selected
  range so its first displayed date can use the complete trailing window.
- `summary` returns the first and last observed weight, their change, and the
  average across days that contain Steps data. Empty periods return the full
  calendar series with null metric fields and null summary values.

Current Sleep insights behavior:
- The server enforces the same `analytics_enabled` entitlement and scopes every
  query to the authenticated user plus the system-owned default
  `sleep_duration` definition. Free requests return `403`; same-slug custom
  metrics and another user's records are excluded.
- The fixed analysis window is the current UTC wake date plus the preceding six
  UTC dates. Every date is returned. Missing nights contain null duration and
  interval fields and never count as zero sleep.
- If multiple Sleep records end on one UTC date, the latest `recorded_at` record
  represents that date. The response preserves its UTC `period_start` and
  `recorded_at` timestamps so the browser can display timing in local time.
- Without a query override, `target_minutes` uses the authenticated user's
  persisted `sleep_target_minutes`, which defaults to `450` (7h30m). An
  explicit whole-minute value from `60` through `1439` previews a different
  calculation without saving it; persistence requires the preference PATCH.
- `shortfall_minutes` is `max(target - duration, 0)` for each tracked night.
  `total_shortfall_minutes` sums those values; longer nights do not offset
  shorter nights. This is labeled an estimate rather than a clinical measure.
- The summary also returns tracked nights, nights under target, average tracked
  duration, and the shortest tracked night.

Current Consistency & Coverage behavior:
- The fixed window is the current UTC date plus the preceding six UTC dates.
  `dates` always contains all seven dates in chronological order.
- The endpoint includes active system-owned default definitions and the
  authenticated user's active custom definitions. Inactive custom metrics,
  another user's definitions and entries, and future-dated entries are
  excluded.
- `day_presence` records whether at least one entry ended on each UTC date.
  Multiple entries for one metric on one date still count as one tracked day.
- `current_window_streak_days` counts consecutive present dates ending on the
  current UTC date and is deliberately bounded to the displayed seven dates.
- `last_recorded_at` can predate the seven-day window. Summary coverage reports
  metrics with data in the window, total included metrics, and dates containing
  any included entry. The endpoint makes no judgment about an appropriate
  tracking frequency and does not label metrics stale.

**Example: Creating a custom metric definition**
```json
POST /api/v1/metrics/definitions/
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...

{
  "name": "Mood",
  "slug": "mood",
  "unit": "score",
  "category": "custom",
  "min_value": 1,
  "max_value": 10
}

// Response: 201 Created
{
  "id": "7bd9858f-4d27-4a30-9f4d-129f0243b9d6",
  "name": "Mood",
  "slug": "mood",
  "unit": "score",
  "category": "custom",
  "min_value": 1.0,
  "max_value": 10.0,
  "is_default": false,
  "is_active": true
}
```

Custom metric-definition create behavior:
- Authentication is required.
- The backend stores the authenticated user on the definition; clients do not submit `user`.
- `is_default` is server-controlled and always `false` for this endpoint.
- A user cannot create a duplicate custom metric slug for their own account.
- A user cannot create a custom metric with a slug already used by a system default metric.
- `max_value` must be greater than `min_value`.
- The active custom metric limit comes from the authenticated user's current `SubscriptionPlan`. The seeded free plan currently allows 3; other plans can define different limits. Inactive archived custom metrics and system defaults do not count.
- If the active custom metric limit is reached, create returns `400` with `{"non_field_errors": ["Active custom metric limit reached."]}`.
- Creation runs the per-user limit check and insert in one database transaction while holding a PostgreSQL row lock on the authenticated user. Concurrent requests for the same account therefore cannot both claim the final available slot.

Custom metric-definition update behavior:
- `PATCH /api/v1/metrics/definitions/{id}/` supports partial updates for an authenticated user's own custom metric definitions, including inactive custom definitions so users can reactivate archived metrics.
- Updateable fields include `name`, `unit`, `category`, `min_value`, `max_value`, and `is_active`.
- `slug` is writable on create but immutable on update because dashboard links, metric-entry creation, and route params use it as the public metric identifier.
- System default metric definitions cannot be updated through this endpoint.
- Another user's custom metric definition returns `404` because it is outside the caller's visible update queryset.
- Range validation still applies during partial updates; if only one bound is submitted, the serializer validates it against the existing stored bound.
- Deactivation is a soft archive, not a hard delete. Existing metric entries remain preserved and readable; inactive metric definitions cannot be used for new entries.
- Reactivating an archived custom metric counts against the active custom metric limit and returns the same `non_field_errors` response if the user is already at the limit.
- Reactivation acquires the same per-user row lock, reloads the definition after obtaining the lock, and performs validation plus update in one transaction.
- Updating metadata on an already-active custom metric is still allowed at the limit because it does not add another active metric.

Custom metric-definition list behavior:
- `GET /api/v1/metrics/definitions/` is active-only by default.
- The system-owned `steps` definition uses unit `steps`, category `activity`, and an accepted per-entry range of `0` through `200000`.
- `GET /api/v1/metrics/definitions/?include_inactive=true` returns active system defaults plus the authenticated user's custom metric definitions, including inactive ones.
- Inactive system defaults remain hidden.
- Another user's custom definitions are never returned, regardless of `include_inactive`.
- Responses include `is_active` so clients can separate active metrics from archived custom metrics.
- See `reference_docs/knowledge/04-data-flow-examples.md` for the full frontend hook → API helper → DRF view/queryset → serializer → TanStack Query cache flow.

Metric usage behavior:
- `GET /api/v1/metrics/usage/` requires authentication.
- The response is `{"active_custom_metrics": {"used": 2, "limit": 3}}`.
- `used` counts only active, user-owned, non-default metric definitions for `request.user`.
- System defaults, inactive custom metrics, and other users' custom metrics do not count.
- `limit` comes from the authenticated user's current subscription plan. The frontend must not hard-code or independently infer this value.

**Data passing convention:**
- **Path params** → required resource identifiers (`/analytics/{slug}/`, `/wearables/connections/{id}/`)
- **Query params** → optional filters and modifiers (`?metric=resting_hr&from=2026-01-01&range=30d&limit=20`)
- **Request body** → data payloads for creating/updating resources

**Example: Logging a metric entry**
```json
POST /api/v1/metrics/entries/
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...

{
  "metric_definition": "resting_hr",
  "value": 58,
  "period_start": null,
  "recorded_at": "2026-03-05T07:15:00Z",
  "context": {"notes": "morning measurement"}
}

// Response: 201 Created
{
  "id": 984312,
  "metric_definition": "resting_hr",
  "value": 58,
  "recorded_at": "2026-03-05T07:15:00Z",
  "source": "manual",
  "context": {"notes": "morning measurement"},
  "created_at": "2026-03-05T07:15:02Z"
}
```

Metric-entry create behavior:
- `metric_definition` is the public metric slug, not the database UUID.
- The slug lookup is scoped to active system defaults plus the authenticated user's active custom metric definitions.
- The backend stores the authenticated user on the entry; clients do not submit `user`.
- `source` defaults to `manual` for this endpoint.
- Manual `sleep_duration` creation requires `period_start` as bedtime and uses
  `recorded_at` as wake time. The server derives `value` as elapsed hours, so
  clients omit `value`; missing or non-increasing bounds are rejected.
- Other manual metrics still require `value` and reject `period_start`.
- `value` is validated against the selected metric definition's `min_value` and `max_value`.
- Inactive metric definitions cannot be used for new entries.
- Another user's custom metric definitions cannot be used, even if the slug is known.

Metric-entry detail behavior:
- `PATCH /api/v1/metrics/entries/{id}/` supports partial updates for an authenticated user's own manual entry.
- `PATCH` can update fields such as `value`, `recorded_at`, and `context`.
- Manual Sleep updates send `period_start` and `recorded_at`; the server
  recomputes duration rather than trusting a client-computed value.
- Update validation still uses the entry's metric definition, so `value` must remain between that metric's `min_value` and `max_value`.
- `DELETE /api/v1/metrics/entries/{id}/` deletes an authenticated user's own manual entry and returns `204`.
- Provider/import-owned entries are immutable through the generic metric-entry detail endpoint. `PATCH` and `DELETE` return `409` with `Synced metric entries cannot be edited or deleted.` so local edits cannot diverge from the durable provider record identity or cause a deleted record to be imported again.
- Entry detail lookups are scoped to `request.user`; another user's entry returns `404` rather than `403` because it is outside the caller's visible queryset.

#### Subscriptions (R4+, JWT required)
| Method | Endpoint | Description | Notes |
|---|---|---|---|
| GET | `/api/v1/subscriptions/current/` | Current subscription and plan entitlements | JWT required; scoped to `request.user`; read-only |
| GET | `/api/v1/subscriptions/plans/` | Active plan catalog and entitlements | Public; active plans only; default plan first |
| POST | `/api/v1/subscriptions/checkout/` | Create Stripe Checkout session | JWT required; returns redirect URL; idempotent per CheckoutAttempt |
| POST | `/api/v1/subscriptions/portal/` | Create Stripe Customer Portal session | JWT required; returns a short-lived hosted portal URL |
| POST | `/api/v1/subscriptions/stripe/webhook/` | Stripe webhook receiver | No JWT — uses Stripe signature verification instead |

Current-subscription read behavior:
- `GET /api/v1/subscriptions/current/` returns the authenticated user's current subscription `id`, lifecycle `status`, `billing_portal_available`, billing-period state (`current_period_start`, `current_period_end`), cancellation state (`cancel_at`, `cancel_at_period_end`), current billing `price`, plan identity, and backend-owned entitlement values.
- Wearable sync policy is explicit: `automatic_sync_enabled` controls whether official clients may schedule unattended work, while `sync_interval_minutes` is the minimum cadence used for periodic scheduling or manual-sync cooldown. Clients must consume these values instead of inferring policy from `plan.code`.
- The MVP Free policy is one Health Connect connection, `automatic_sync_enabled=false`, and manual sync every 30 minutes. The MVP Pro policy enables automatic sync every 15 minutes; monthly and yearly prices share the same Pro entitlements.
- PostgreSQL rejects an automatically syncing plan whose interval is below WorkManager's 15-minute platform minimum. Android also rejects such a response defensively instead of attempting an invalid schedule.
- Free subscriptions and newly-created paid subscriptions can return `null` for period dates, `cancel_at`, and `price`. Paid Stripe subscriptions return price as `{currency, unit_amount, billing_interval}` without exposing Stripe provider price IDs.
- `billing_portal_available` is a backend-derived boolean that is true when the authenticated user has a local Stripe `BillingCustomer`. It lets clients decide whether to offer billing management without exposing the provider customer ID.
- Current means `trialing`, `active`, `past_due`, or `incomplete`; cancelled rows remain history and are excluded.
- The subscription, plan, and price are loaded together with `select_related("plan", "price")`.
- The route intentionally does not support `PATCH`. A client cannot grant itself paid entitlements by submitting a plan code.

Plan-catalog behavior:
- `GET /api/v1/subscriptions/plans/` does not require authentication so registration and pricing screens can render available tiers.
- Only plans with `is_active=True` are returned; retired plans remain available to historical subscription rows but cannot be newly selected.
- The default plan is ordered first, followed by plan code for deterministic responses.
- The response exposes backend-owned entitlement values, `is_default`, and each plan's active billing prices.
- Public prices contain the application's price UUID, currency, amount in minor currency units, and billing interval.
- Inactive prices are retained for billing history but excluded from new checkout choices.
- Stripe `provider_price_id` values remain server-side and are never exposed through the catalog.
- The view prefetches active prices in one additional query and attaches them as `active_prices`, avoiding one price query per plan.

Checkout behavior:
- `POST /api/v1/subscriptions/checkout/` requires JWT authentication.
- Request body accepts `price_id`, which is the application's internal `SubscriptionPrice.id`, not Stripe's provider price ID.
- The selected price must be active, belong to an active non-default plan, and use the Stripe provider.
- The authenticated user must already have one current subscription row. Registration creates a Free current subscription, so a missing current subscription is treated as inconsistent local state and returns `400`.
- Checkout rejects the exact current subscription price so repeated checkout for the same active price does not create a new Stripe session.
- If the current subscription already has a Stripe provider subscription ID, Checkout rejects selecting a different price with `400`. Paid plan changes remain unsupported until Customer Portal price-change reconciliation is implemented, preventing a second concurrently billed Stripe subscription or provider/local state drift.
- Under the user-row lock, the service reconciles saved checkout receipts before
  allowing a new purchase. It reuses an open session for the same price/current
  subscription (`201` with its existing URL), and confirms expiration of other
  open links before creating a replacement for a different price.
- A completed session with a nonterminal Stripe subscription, an existing paid
  local plan, or any nonterminal subscription found across the known customer's
  paginated Stripe history blocks another purchase. New service conflicts return
  `409 {"detail": "..."}` instructing the user not to pay again or to manage billing.
  Existing serializer-level `400` validation remains unchanged.
- A previous pending/failed attempt without a saved provider receipt also returns
  `409` and needs billing verification: an ambiguous provider failure is not proof
  that no checkout was created. Provider reads, ownership checks, and expiration
  failures return generic `502` without creating another session.
- A missing historical session (`404 resource_missing`) can be retired only with
  a saved Stripe customer and a confirmed receipt, or a completed sandbox receipt
  at least 90 days old. All other attempts and the customer's paginated subscription
  history must pass verification first. Missing recent/unresolved receipts or a
  missing customer return `409`; other provider errors still return `502`.
- After these checks, the service creates a local `CheckoutAttempt` before
  requesting a new Stripe session. Cancelled/incomplete-expired subscriptions
  permit a new purchase; no subscriptions are cancelled by this checkout guard.
- `CheckoutAttempt.expected_subscription` stores the user's current subscription at checkout creation time; this is the subscription state the later Stripe webhook is allowed to replace.
- `CheckoutAttempt.id` is used as the Stripe idempotency key, so retries of the same local attempt use the same provider retry identity.
- Stripe Checkout receives the server-owned `SubscriptionPrice.provider_price_id` in `line_items`; clients cannot submit provider price IDs or amounts.
- If the user already has a local Stripe `BillingCustomer`, Checkout sends its `provider_customer_id` as Stripe's `customer` so later purchases reuse the same provider customer.
- If no local Stripe `BillingCustomer` exists yet, Checkout sends `customer_email`; Stripe creates the customer during the first subscription Checkout and the verified completion webhook persists the returned `cus_...` identifier locally.
- The Stripe metadata includes `user_id`, `checkout_attempt_id`, `subscription_price_id`, and `subscription_plan_id` for later webhook reconciliation.
- If Stripe creates the Checkout Session, the attempt is marked `completed` and stores `provider_checkout_session_id`; this means only that the provider session exists.
- If Stripe creation fails, the attempt is marked `failed`, the view logs the exception, and the API returns `502` with a generic public error.
- Successful response shape is `201 {"url": "https://checkout.stripe.com/..."}`,
  including a safely reused session. Concurrent clicks share the same user lock
  and receipt, so a second request cannot create a parallel checkout.
- Checkout creation does **not** grant paid entitlements. Entitlements change only after a trusted Stripe webhook confirms payment/subscription state.

Customer Portal behavior:
- `POST /api/v1/subscriptions/portal/` requires JWT authentication and accepts no client-supplied Stripe customer ID.
- The endpoint resolves the authenticated user's Stripe `BillingCustomer`; users without that mapping receive `400 {"detail": "No Stripe billing customer is available."}`.
- Settings shows its **Manage subscription** action only when the current-subscription response has `billing_portal_available=true`.
- Django creates an on-demand Stripe Billing Portal Session with the stored `provider_customer_id` and server-controlled `STRIPE_CUSTOMER_PORTAL_RETURN_URL`.
- Successful response shape is `201 {"url": "https://billing.stripe.com/p/session/..."}`. Portal URLs are short-lived and must be created when the user intends to manage billing.
- Stripe SDK failures are logged server-side and return a generic `502 {"detail": "Unable to create Customer Portal session."}` without exposing provider details.
- Portal configuration is owned by Stripe and is separate for sandbox and live mode. Until price-change reconciliation is implemented, portal plan switching must remain disabled; cancellation and payment-method management are the supported initial capabilities.

Stripe webhook behavior:
- `POST /api/v1/subscriptions/stripe/webhook/` does not require JWT authentication because Stripe cannot send our application JWT.
- The endpoint authenticates the provider request with the `Stripe-Signature` header and `STRIPE_WEBHOOK_SECRET`.
- Invalid signatures return `400 {"detail": "Invalid Stripe webhook signature."}` and are not processed.
- Verified events are recorded in `StripeWebhookEvent.provider_event_id`; repeated delivery of the same Stripe event ID is a no-op.
- `checkout.session.completed` reads the server-generated metadata from the Checkout Session, verifies the local `CheckoutAttempt` by both metadata attempt ID and provider Checkout Session ID, then changes the user's current subscription to the selected paid plan.
- If metadata is missing or the provider Checkout Session ID does not match the stored `CheckoutAttempt.provider_checkout_session_id`, the event is recorded but no subscription state changes.
- If metadata contains a `subscription_price_id` that does not belong to the metadata `subscription_plan_id`, the event is recorded but no subscription state changes.
- If the user's current subscription no longer matches `CheckoutAttempt.expected_subscription`, the event is recorded but no subscription state changes.
- The event must contain non-empty Stripe `customer` and `subscription` identifiers.
- A returned Stripe customer must either match the user's existing `BillingCustomer` or be unowned locally. A mismatch or a customer already owned by another user is recorded but does not change subscriptions or Checkout status.
- On the first successful Checkout, webhook reconciliation creates the user's Stripe `BillingCustomer`; later Checkout creation reuses that provider customer ID.
- After a successful webhook-driven transition, the matching `CheckoutAttempt` is marked `confirmed`.
- The subscription transition reuses the existing stale-write guard: it passes `CheckoutAttempt.expected_subscription_id` to `change_subscription_plan`.
- `customer.subscription.updated` requires the Stripe subscription ID and customer ID to match the current local Stripe subscription and its user's `BillingCustomer`. It synchronizes Stripe `cancel_at`, normalized local `cancel_at_period_end`, current billing-period timestamps, and the local `SubscriptionPrice` when the Stripe item includes a recognized active `price.id`.
- If Stripe sends an item `price.id` that matches an active local `SubscriptionPrice.provider_price_id`, the backend updates the local subscription `price` and `plan` to prevent Portal monthly/yearly switching drift. Unknown or inactive provider prices are not applied, emit a warning log with Stripe IDs, and do not block period/cancellation synchronization.
- Stripe can represent a scheduled period-end cancellation either as `cancel_at_period_end=true` or as `cancel_at` equal to the subscription item's `current_period_end` while `cancel_at_period_end=false` in flexible billing/Portal flows. The backend stores the exact `cancel_at` timestamp and treats `cancel_at == current_period_end` as local `cancel_at_period_end=true`.
- A populated cancellation flag or future `cancel_at` means the paid subscription remains current until Stripe terminates it; it does not immediately grant Free entitlements.
- `customer.subscription.deleted` requires the same subscription/customer ownership match. It marks the ended paid subscription as historical and creates a new active subscription for the configured default Free plan.
- Unhandled event types are acknowledged after event recording but do not mutate application state.

Subscription transition contract:
- The internal transition service requires the ID of the subscription state the caller observed.
- It locks the user row, reloads the current subscription, and only proceeds when that ID still matches.
- A transition to a non-default paid plan requires an active `SubscriptionPrice` belonging to that plan.
- A transition to the default Free plan accepts `price=None`.
- The replacement subscription stores both the selected plan and exact selected price; the cancelled row preserves the previous selection as history.
- Missing or inactive prices are rejected before cancellation. A cross-plan price is rejected while saving the replacement; the atomic transaction then rolls back the preceding cancellation, leaving existing state unchanged.
- Trusted webhook processing must return or record a conflict when the expected subscription was already replaced.
- Stripe webhook handlers use provider event idempotency in addition to this local stale-write guard.

#### Health Connect Wearables (R2 internal spike, R3 MVP, JWT required)

Current implementation status:
- The `WearableConnection` model exists and `GET /api/v1/wearables/connections/` returns the authenticated caller's connections.
- `POST /api/v1/wearables/connections/` accepts only `provider=health_connect`, assigns ownership from the authenticated caller, and enforces the current plan's `wearable_connection_limit`. Client-supplied ownership, activation, status, sync/error, ID, or timestamp fields are rejected with `400` rather than silently ignored.
- Users who have consumed every connection slot receive `400`. Only active connection rows consume slots.
- The canonical MVP Free and Pro plans each permit one Health Connect bridge. Free permits explicit manual sync only; Pro additionally permits automatic scheduling. Source apps such as Fitbit and Samsung Health are record provenance, not connection providers, because their records reach the app through Health Connect.
- The official Android client reads the current subscription before scheduling or enabling manual sync. Free cancels stale periodic work and permits a new foreground tap only after the persisted 30-minute cooldown; Pro schedules the server-provided 15-minute interval and rechecks automatic entitlement inside each worker execution.
- A user cannot register the same active provider twice. Duplicate active `health_connect` creation returns `400` with `provider: ["This provider is already registered."]`. The database enforces one durable row per `(user, provider)`, and registration after disconnect reactivates that row with the same UUID. New and reactivated rows enter `status=pending` until trusted ingestion proves the bridge is working.
- `DELETE /api/v1/wearables/connections/{id}/` marks only a caller-owned active connection inactive and immediately releases its plan slot while preserving identity/history. A successful disconnect returns `204`; another user's, unknown, or already-inactive UUID returns `404` without changing data.
- The Android client now exposes this disconnect action from its Ready state. A confirmed `204`, or a `404` from stale already-inactive local state, cancels only that connection's unique WorkManager request and removes only that connection's device cursor. Authentication, transport, and server failures keep the Ready state retryable and do not perform local cleanup.
- `GET /api/v1/wearables/connections/{id}/status/` returns the caller-owned connection's provider, status, last sync timestamp, and last error. Another user's or an unknown UUID returns `404`.
- `POST /api/v1/wearables/uploads/` requires JWT authentication and a body containing `connection_id`, `upload_id`, and `1–100` normalized `entries`. It resolves only an active connection owned by the caller and processes the batch synchronously. A new batch returns `201` with a terminal successful `SyncRun`; an exact retry returns the unchanged run with `200`; conflicting upload or external-record identity reuse returns `409`. Missing, invalid, or undeclared fields return `400`.
- `GET /api/v1/metrics/entries/daily-steps/` returns authenticated caller-owned Steps as one summed value per local calendar date. To prevent double-counting during provider migrations, each day uses exactly one available source in this order: Fitbit, Samsung Health, manual, CSV import, Garmin, Oura, Withings. Only the active default system `steps` definition participates. A Steps interval is attributed in full to the requested local date containing its `recorded_at` end timestamp; it is not proportionally split when it crosses midnight because the aggregate record does not reveal when individual steps occurred. Each result includes its `local_date`; the endpoint requires a valid IANA `timezone`, returns `400` for malformed timezone or timestamp input, interprets `from` and `to` as selectors for complete local dates rather than partial-day cutoffs, caps the positive `limit` at 366 days, and leaves raw interval rows unchanged for deduplication and export.
- `GET /api/v1/metrics/entries/daily-hrv/` returns authenticated caller-owned HRV as one median value per local calendar date, using the same one-source-per-day precedence, active-default-definition boundary, input validation, and whole-local-date filter semantics. Each result includes its `local_date`. The endpoint uses PostgreSQL `PERCENTILE_CONT(0.5)`, caps the positive `limit` at 366 days, and leaves raw samples unchanged for provenance, provider corrections, and export.
- `MetricEntry` has nullable `source_connection`, `period_start`, and `source_record_modified_at` fields. Instantaneous metrics leave `period_start` null; interval metrics use `recorded_at` as the interval end. PostgreSQL requires a non-null period start to precede `recorded_at` and enforces at most one non-null `(source_connection, external_source_id)` pair. The ingestion service skips identical records, updates mutable content only when the provider timestamp is newer, permits one timestamped upgrade of a legacy null-version row, and rejects stale or inconsistent versions.
- Metric history exposes each entry's trusted `source`. The web UI labels imported rows by source and withholds manual Edit/Delete controls; the backend independently rejects direct mutation attempts with `409`.
- `WearableUploadEntrySerializer` is the live nested-entry boundary. It accepts active system `body_weight`, `steps`, `sleep_duration`, `resting_hr`, `hrv`, `distance`, and `total_calories_burned` definitions, enforces each configured value range, rejects non-finite numbers, parses record and optional provider-modification timestamps, accepts Fitbit, legacy Samsung Health, and generic Health Connect provenance, and requires a nonblank external source ID. Steps, Sleep, Distance, and Total Calories Burned require `period_start < recorded_at`; instantaneous Weight, resting heart rate, and HRV reject a supplied period start. Current Android uploads always send Health Connect's `metadata.lastModifiedTime` as `source_record_modified_at`; omission remains accepted for backward compatibility but cannot authorize changed content.
- `WearableUploadBatchSerializer` is the live request boundary. It composes `connection_id`, `upload_id`, and a required list of `1–100` normalized entries, rejects undeclared fields at both levels, and rejects repeated `external_source_id` values within one batch.
- The server-side canonical payload-hash helper fingerprints validated entries with schema version `1`, stable external-record ordering, UTC timestamps, and SHA-256. The live ingestion service uses it to reuse exact retries and reject conflicting upload identity reuse.
- Connection-state mutations will belong to trusted ingestion/resync services rather than a generic client `PATCH` endpoint.
- Do not start with full sample ingestion, resync, Celery jobs, or Android integration until the connection contract exists and is tested.

| Method | Endpoint | Description | Notes |
|---|---|---|---|
| GET | `/api/v1/wearables/connections/` | List linked sync connections | Implemented; JWT required; returns only the caller's active connections |
| POST | `/api/v1/wearables/connections/` | Register a wearable connection | Accepts only `provider=health_connect`; ownership and activation are server-managed; new/reactivated rows use `status=pending`; current-plan connection limit enforced; reactivates the preserved provider row after disconnect |
| GET | `/api/v1/wearables/connections/{id}/status/` | Fetch sync state for one connection | Implemented; JWT required and owner-scoped; includes `provider`, `status`, `last_synced_at`, and `last_error`; unowned or unknown UUIDs return `404` |
| POST | `/api/v1/wearables/uploads/` | Process a normalized wearable batch | Implemented synchronously; JWT required; accepts `connection_id`, `upload_id`, and `1–100` entries; validates active caller ownership; returns terminal counters with `201` for new work, `200` for an exact retry, `409` for upload/record conflicts, and `400` for invalid input |
| GET | `/api/v1/metrics/entries/daily-steps/` | Read daily Steps totals | JWT required; selects one preferred source per requested local date, sums its caller-owned intervals, supports `from`, `to`, and `limit`, and preserves raw rows |
| GET | `/api/v1/metrics/entries/daily-distance/` | Read daily Distance totals | JWT required; caller-owned Health Connect platform totals; kilometres |
| GET | `/api/v1/metrics/entries/daily-total-calories/` | Read daily Total Calories totals | JWT required; caller-owned Health Connect platform totals; kilocalories including resting expenditure |
| GET | `/api/v1/metrics/entries/daily-hrv/` | Read daily HRV medians | JWT required; selects one preferred source per requested local date, calculates its caller-owned median, supports `from`, `to`, and `limit`, and preserves raw rows |
| DELETE | `/api/v1/wearables/connections/{id}/` | Disconnect provider | Implemented; JWT required; caller-owned active rows return `204` and become inactive; unknown, unowned, or already-inactive rows return `404`; repeated calls remain state-idempotent |
| POST | `/api/v1/wearables/connections/{id}/resync/` | Request replay / resync from the client | Returns 202 Accepted — backend records replay intent and the Android client performs the upload |

Immediate connection-foundation contract:
- All connection endpoints require JWT authentication.
- The backend scopes all connection reads/writes to `request.user`; another user's connection must not be visible or mutable.
- Status reads use the caller-owned queryset, preventing another user's connection existence, sync timestamp, or error state from being disclosed.
- Disconnect marks the caller-owned connection inactive and releases its entitlement slot without erasing its stable identity or future sync history; ownership/active filtering makes another user's, unknown, and inactive UUIDs indistinguishable.
- The first implementation should expose enough data for Settings or a future Wearables page to show provider, status, `last_synced_at`, and `last_error`.
- Suggested first response shape:

```json
{
  "id": "7df7e4ab-7e6f-4558-b9be-17c824fbf54e",
  "provider": "health_connect",
  "status": "connected",
  "last_synced_at": null,
  "last_error": "",
  "created_at": "2026-07-11T10:15:00Z",
  "updated_at": "2026-07-11T10:15:00Z"
}
```

First-slice non-goals:
- No real Samsung Health or Health Connect integration yet.
- No Celery sync job yet.
- No TimescaleDB-specific optimization yet.
- No frontend device authorization flow yet.

MVP Health Connect sync does **not** use provider webhooks or a hosted provider link flow. The Android companion app currently selects Fitbit-originated data on device, uploads batches to our API, and the backend handles validation, deduplication, and persistence. A future aggregator webhook receiver can be added later for providers with cloud-friendly APIs.

**Implemented synchronous example: uploading normalized Weight, Steps, Sleep, resting-heart-rate, and HRV records**
```http
POST /api/v1/wearables/uploads/
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
Content-Type: application/json
```

```json
{
  "connection_id": "7df7e4ab-7e6f-4558-b9be-17c824fbf54e",
  "upload_id": "9ea2c91d-63f4-40eb-a6bb-7fbd90c12a34",
  "entries": [
    {
      "metric_definition": "body_weight",
      "value": 78.4,
      "recorded_at": "2026-07-29T08:00:00Z",
      "source": "fitbit",
      "external_source_id": "health_connect:WeightRecord:record-123",
      "source_record_modified_at": "2026-07-29T08:01:00Z"
    },
    {
      "metric_definition": "steps",
      "value": 420,
      "period_start": "2026-07-29T07:45:00Z",
      "recorded_at": "2026-07-29T08:00:00Z",
      "source": "fitbit",
      "external_source_id": "health_connect:StepsRecord:record-123",
      "source_record_modified_at": "2026-07-29T08:02:00Z"
    },
    {
      "metric_definition": "sleep_duration",
      "value": 7.5,
      "period_start": "2026-07-28T21:30:00Z",
      "recorded_at": "2026-07-29T05:30:00Z",
      "source": "fitbit",
      "external_source_id": "health_connect:SleepSessionRecord:record-123",
      "source_record_modified_at": "2026-07-29T05:35:00Z"
    },
    {
      "metric_definition": "resting_hr",
      "value": 58,
      "recorded_at": "2026-07-29T06:00:00Z",
      "source": "fitbit",
      "external_source_id": "health_connect:RestingHeartRateRecord:record-123",
      "source_record_modified_at": "2026-07-29T06:01:00Z"
    },
    {
      "metric_definition": "hrv",
      "value": 42.5,
      "recorded_at": "2026-07-29T06:00:00Z",
      "source": "fitbit",
      "external_source_id": "health_connect:HeartRateVariabilityRmssdRecord:record-123",
      "source_record_modified_at": "2026-07-29T06:01:00Z"
    }
  ]
}
```

```json
{
  "id": "6ac744c4-8202-4cd7-91c7-3d44ea067381",
  "connection_id": "7df7e4ab-7e6f-4558-b9be-17c824fbf54e",
  "upload_id": "9ea2c91d-63f4-40eb-a6bb-7fbd90c12a34",
  "status": "succeeded",
  "entries_imported": 1,
  "entries_updated": 0,
  "entries_skipped": 0
}
```

#### Real-Time Streaming (R5+)
```
ws://host/ws/metrics/stream/
```
Not REST — persistent WebSocket connection. Ticket-based auth (short-lived token from REST endpoint, included in WS handshake). Used for live dashboard updates when new manual or wearable data lands; not for direct device-to-server streaming in MVP.


### Activity metrics and Health Connect totals (2026-10-16)

Shared activity definitions are `distance` in kilometres (`km`) and `total_calories_burned` in
kilocalories. Total energy includes resting expenditure; active energy does not.
Both accept nonnegative finite values up to 1,000,000 per entry. Every user
sees these definitions even without readings; custom metrics remain supported.

Android reads raw Distance and TotalCaloriesBurned records
from all writer apps and preserves their IDs, intervals, package identities and
provider modification timestamps. These raw uploads use `source="health_connect"`
and a validated `source_package_name` of at most 255 characters. Provenance is
stored in entry context, participates in payload hashing and cannot change under
a stable external record ID, even with a newer provider version.

Android also calls Health Connect's `aggregateGroupByDuration` with no writer
filter, allowing the platform to apply the user's Activity source priorities.
UTC-aligned 15-minute snapshots support regrouping into current IANA local days
without choosing an arbitrary app or summing overlapping raw records. These use
the existing bounded upload API with:

- `aggregation="health_connect"` and `has_data=true|false`;
- no single `source_package_name`, since the platform combines writers;
- `external_source_id="health_connect:aggregate:<metric_slug>:<UTC bucket start>"`;
- `period_start` aligned to a UTC 15-minute boundary and an exclusive
  `recorded_at` end no more than 15 minutes later (the current bucket may be partial);
- `source_record_modified_at` equal to the device's snapshot observation time,
  at or after the bucket end. This is a snapshot version, not a raw record's
  provider modification timestamp.

Snapshots live in MetricEntry with explicit aggregation/has-data context. Raw
and derived identities cannot replace each other. An empty bucket is uploaded
as zero with `has_data=false` to clear a previously stored aggregate, but it does
not create a reading or consistency-tracking day. Payload hashing includes these
fields. Identical replays skip, newer corrections replace the snapshot, and stale
changed content returns `409`. Existing raw uploads remain backward compatible.

Daily endpoints are `/api/v1/metrics/entries/daily-distance/` and
`/api/v1/metrics/entries/daily-total-calories/`. All require JWT ownership and
share valid IANA `timezone`, whole-local-date `from`/`to`, descending date order,
default 30 result days and maximum 366 result days. They sum present platform
buckets, assign an exclusive midnight end to the preceding day, and return
`context.aggregation="health_connect_daily"`. Dates lacking a platform total may
show manual/CSV/legacy source data. Raw generic Health Connect records are never
used as a fallback: missing snapshots remain empty until the device syncs.

Dashboard cards and detail charts use daily endpoints. Raw entry history and
metric CSV exports exclude snapshots; account export/deletion retains the full
stored dataset through the existing MetricEntry lifecycle. Synthetic daily IDs
remain presentation-only and never supply mutation IDs.

The v4 activity cursor namespace forces a bounded initial 30-day backfill.
Later syncs use the existing 24-hour overlap. Historical priority changes or
provider corrections outside that window need a fresh bounded backfill; live
Health Connect aggregation is unavailable to the server without the phone.

The initial implementation chose an alphabetically first package for daily
activity totals. That was incorrect for the intended product behavior and is
superseded by the platform snapshots above. The original five Android metric
planners still filter Fitbit; this change applies to these two activity types.


Platform totals may have different coverage from raw source-app exports. In the
verified local dataset, Health Connect returned total-energy aggregates for dates
without imported Fitbit total-energy records. Preserve the platform result as a
platform calculation; do not label it as a Fitbit-authored reading or promise
identical Fitbit monthly totals. The official record definition includes active
and basal energy: https://developer.android.com/reference/kotlin/androidx/health/connect/client/records/TotalCaloriesBurnedRecord


### Active Calories removed by product decision (2026-10-16)

Total Calories Burned is the only system calorie metric. Migration 0011 sets the
shared `active_calories_burned` definition inactive without deleting its entries.
Runtime default seeding no longer recreates/reactivates it. The catalog and
standard entry feed hide inactive system metrics; full metric CSV/account export
and account deletion retain their existing ownership and history semantics.
New wearable Active Calories uploads are rejected. The daily-active-calories
route has been removed (404). Android no longer reads that type, schedules its
coordinator, or declares/requests READ_ACTIVE_CALORIES_BURNED. This does not
restrict user-owned custom metrics or remove Distance. Current Android sync
requires the original five read permissions plus Distance and Total Calories.
Earlier Active Calories acceptance notes describe historical implementation.

### Workout exercise selection actions — 2026-10-22

`POST /api/v1/workouts/sessions/{uuid}/exercises/bulk/` requires JWT and an
owned, open workout. The request is either `{action:"delete", exercise_ids:[UUID]}`
or `{action:"reorder", exercise_ids:[UUID], expected_order:[UUID]}`. IDs must be
nonempty and unique. Reorder supplies every exercise once and the original visible
order; a changed order returns `409` without writes. Missing/foreign selections
return `404`, invalid input or finished workouts `400`, unauthenticated `401`.
Unknown request fields are rejected. Deletion removes only selected occurrences
and their sets, retaining the session, library and other occurrences. Both actions
are atomic under the existing per-user mutation lock and return the full workout
(`200`). Reorder normalizes display_order to 10,20,… and preserves sets/groups.
No database migration. Existing individual delete/move endpoints remain available.

### Workout equipment metadata — 2026-10-22

The existing authenticated `GET/PATCH /api/v1/workouts/preferences/` and catalog
preferences payload now retain optional plate metadata: `colour` is a six-digit
hex string (`#RRGGBB`), and `enabled` is a boolean. Existing `{weight, count}` rows
remain valid; absent `enabled` means usable when count is positive. Disabled rows
keep their counts but are excluded from loading. Existing limits remain: 20 sizes
per unit, distinct positive weights ≤1000 with three decimals and counts 0–100.

`exercise_bars` is an optional replacement list (maximum 500):
`{exercise_id: uuid, weight_unit: "kg"|"lb", weight: decimal-string}`.
Each exercise must belong to the caller; missing/foreign IDs reject with 400.
There can be one entry per exercise/unit, with weight 0–1000 and three decimals.
An empty list clears overrides. Omitting the field preserves it. Unit-specific
default bars apply where no matching override exists. Migration
`workouts.0013_exercise_bars` adds this JSON field with an empty-list default.
Account export includes it and account deletion cascades the preferences row.

Calculator reads/writes use existing records and set endpoints. Record selection
is bounded to the workout date and saved unit/type. Adding a calculated weight
POSTs `{weight, reps:null, is_completed:false}` to the existing set endpoint;
it does not record an observed lift or trigger completion effects. Route paths
are unchanged.

### Training history and copy-to-current exercise — 2026-10-22

`GET /api/v1/workouts/sessions/` accepts `all_history=true` with required owned
`exercise_id` and `date_to`. This returns all matching sessions through that date
using the existing limit/offset pagination (maximum 100), without a 90-day cutoff.
`date_from` is not used in this mode. Other reads still require `date_from` and
retain the 1–366-day range limit. No records are created by these reads.

`POST /api/v1/workouts/session-exercises/{item_id}/copy-sets/` appends selected
sets to an existing owned occurrence. Body:
`{source_workout_id: uuid, set_ids: uuid[]}`. Select 1–100 distinct IDs from that
owned source workout; unknown fields reject. Target/source exercise IDs, frozen
tracking type and both unit fields must match. The target must be open; a finished
source can be read. Missing/foreign workouts or targets return 404; invalid sets,
incompatible partitions or closed targets return 400. Authentication is required.

The existing owner row lock and a transaction validate every ID before writes.
Copies retain the source workout's occurrence/set order, append after existing
sets and return a 201 array of new set representations. Values are read from the
saved source at copy time; new IDs are generated, comments cleared and completion
reset to false. No workout, occurrence, timing or group change is created. A bad
selection causes no partial append. No schema migration is required for this slice.

### Exercise analytics controls and strength metric goals — 2026-10-22

Existing routes remain unchanged. Progress reads accept `rep_limit` (integer 1–30,
default 10) for estimated 1RM and `per_workout` (boolean, default false). The
Training/overview Graph requests one point per workout; legacy date-based reads
keep their default. New metrics: `workout_distance`, `workout_duration` (completed
sets summed per workout and frozen partition), and `rep_maxes` (strict observed
PR improvements at the requested `reps`, through `date_to`). Existing limit/offset
bounds and owned exercise checks apply. Graph rep-max windows filter all-time
strict records after reading them, so a prior record remains the baseline.

Records history reads accept `newest_first=true` with `history=true`; the default
order remains unchanged. This lets Records show the current observed record above
previous improvements. Inferred lower-rep precedence is presentation only and is
never inserted into the observed record data.

Statistics reads accept optional `date_from`, owned `workout_id`, and `rep_limit`
(default 10). Reversed dates reject with 400; foreign/missing workout filters
return 404. Each existing frozen-unit group now includes `bests`, keyed by metric,
with the existing progress point JSON shape (value, date and supporting source or
workout ID). Totals remain completed-only; max workout volume sums this exercise
within each session, while max set volume remains distinct. First qualifying
sources retain deterministic chronology on ties.

Strength goal creation additionally accepts `goal_type: max_weight` or
`estimated_1rm` with positive `target_value` ≤100000; `reps` also supports strength
exercises. Type/units stay frozen, target edits reuse PATCH, and ownership/export/
deletion use the existing goal lifecycle. Estimated goals use positive loads up
to 10000 and 1–10 reps, calculating achievement from unrounded Epley values.
This eligibility rule is explicit in the goal label and is independent of the
device's configurable record/graph estimate limit. No inferred record becomes a
goal's observed source. Migration `0014_strength_analytics_goals` expands choices
and the database check constraint; existing goal rows remain valid.

The frontend `/workouts` search accepts optional `section=history|graph|records|
stats|goals` with `view=overview`, allowing previews and the Training trophy to
open a focused section without adding route paths.

With `per_workout=true`, progress point JSON includes the supporting `workout_id`
and session name where available. The graph uses this owned ID for its workout
preview; points without a session ID retain the date-based preview fallback.

Routine management (2026-10-25): both reorder endpoints require unique UUID lists
(maximum 1000 each), an active owned parent, and every current child exactly once.
Stale `expected_order` returns 409 without writes; invalid membership returns 400.
Successful orders normalize ranks to 10, 20, … under the shared owner lock.
Missing/foreign parents return 404. Routine group colours require `#RRGGBB`.
Routine deletion and copying also hold the owner lock; neither modifies logged
workouts. Copy names follow existing owner-wide uniqueness, including archives.

Routine preset draft replacement (2026-10-26): PUT accepts up to 1000 quantity-only
rows and the exact previously read `RoutineSet[]` snapshot in `expected_sets`.
The owned active occurrence is resolved under the user row lock before validation.
Any mismatch returns 409; unknown/performance fields, invalid types/units/values,
or oversized lists return 400 with no writes. Every row validates before replacing
the collection. Saved rows have new UUIDs and normalized 10-step order. Empty
`sets` clears presets; null fields and explicit zero weight retain their meaning.
Only template sets are replaced; started workouts have independent snapshots.
POST/PATCH/DELETE per-set clients remain supported. No schema migration is needed.


### AI provider model availability remediation — 27 October 2026

The configured Nemotron 3 Super endpoint returned HTTP 404 during a diagnostic.
All four offered IDs remained listed by NVIDIA's live `/v1/models` endpoint; listing
does not guarantee that a model's generation endpoint is currently usable. This
is not evidence that the older model has been permanently retired. The local
`.env`, example and code fallback now select `nvidia/nemotron-3.5-super-vl-120b-a12b`.
A representative synthetic tracker request returned HTTP 200, completed normally
and passed the unchanged `weekly-v3` schema/evidence validator. An earlier tiny
single-tracker fixture produced invalid evidence references and was rejected;
validation was not loosened. No real tracker data was sent during these probes.

HTTP 404 now identifies the unavailable model and asks the user to choose another
under New review. Format failures explain an unreadable response, evidence failures
explain that suggestions could not be matched, and connection failures explain
provider reachability. Key errors point to Provider settings. Safe logs contain
only validated model IDs, HTTP status, failure stage and exception type, never
provider bodies, prompts, credentials or tracker values. Existing error response
shape, status codes, time limits, strict validation and saved-success behavior are
unchanged. No automatic model fallback, provider retry or silent key switch occurs.

Idle local web/Celery/Beat services were recreated to load the configuration; both
web and worker report the new default. The existing seven saved reviews remained.
Refresh the AI page to load the new default; explicit model selection still wins.
New jobs use the new handling; previously cached failure messages are not rewritten.
Official current model page: https://build.nvidia.com/nvidia/nemotron-3.5-super-vl-120b-a12b
