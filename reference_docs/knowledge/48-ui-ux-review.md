# Cross-page UI/UX review — 5 October 2026

## Status and scope

Review completed. The user approved starting the shared UI foundation on
5 October 2026, explicitly prioritizing text, label, field, and button alignment.
No account data was changed. The original review itself made no application changes;
the foundation implementation below is a subsequent slice.

Inspected all main routes: Dashboard, metric library/detail variants, three analytics
pages, Recovery, Diet, Settings, authentication/password recovery, and missing-page
state. Workouts covered Home, exercise library, Training, History, Routines,
Calendar, Progress, Overview, overview sub-tabs, and selected dialogs.

The 195 screenshot captures use actual React components with browser-intercepted
fixture APIs, not the user's account data. At the time of the original review,
main views were captured in Dark, Light, and Sand at 390/1440 px; selected
layouts also received 320/768 px probes. Sand was removed on 6 October 2026, so
those captures are historical and the supported themes are now Dark and Light.
No horizontal page overflow was observed in captured layouts. This is not a full
accessibility audit, entitlement test, or complete interaction regression suite.
Sparse fixture data, transient loading, and development overlays must not be
treated as evidence of production defects.

## Findings — original review snapshot

| Priority | Finding | Proposed direction |
| --- | --- | --- |
| P1 | Mobile Training places timers, secondary actions, and exercise management before set entry. Save was approximately 1,736 px down the captured 390 px page. | Put fields, save, and current sets first; collapse the mobile exercise switcher and secondary tools. |
| P1 | CSS declares DM Sans/DM Mono without loading font resources. Browser inspection used Liberation Sans/Noto Sans Mono on the review machine. | Self-host the intended fonts, or explicitly choose a system-font design. |
| P1 | Keyboard focus escapes Create Custom Metric after Cancel into background links. It uses a legacy section with aria-modal rather than the shared native Modal. | Use the shared Modal; test Tab, Shift+Tab, Escape, and focus return. Check metric deactivation's legacy dialog too. |
| P1 | Sleep Insights uses a time input for a duration target; the browser displays 07:30 AM. | Use explicit hours/minutes and put recorded-night coverage near the shortfall headline. |
| P2 | Button heights, field typography, spacing, radii, and date alignment differ by feature. | Share form, button, date-navigation, card, header, and empty-state rules. |
| P2 | Diet summaries precede check-offs on mobile; Recovery evidence makes daily tool cards long. | Prioritize daily actions and disclose trends/research context without removing caveats. |
| P2 | Workout reorder/remove/edit controls compete with logging; nested overview navigation and selectors repeat. | Separate management from logging and clarify navigation levels. |
| P2 | Chart conventions vary between Metrics and Workouts; catalog density, status typography, and page titles need polish. | Share semantic chart tokens and axis/tooltip styles; use meaningful browser titles instead of frontend. |

## Direction and implementation status

Retain the existing identity with Dark and Light themes only. Light is the
recommended reference for dense forms and tables. Previously saved Sand
preferences fall back to Dark. The review artifact matches the project's
existing CSS tokens, not an external kit.

The foundation is approved; later page-specific layout changes are tracked below:

1. Typography and shared controls, date alignment, modal keyboard fixes.
2. Logging-first mobile layouts for Workouts, Diet, and Recovery.
3. Cross-page polish: chart conventions, routine builder, calendar, and nested
   navigation. The sleep-duration control and calendar layout refinements are
   implemented; remaining work is not implied to be approved by this record.

### Shared foundation rules

- Bundle DM Sans Variable (normal/italic) and DM Mono (400/500) through Fontsource
  dependencies. Fonts are local Vite assets, not runtime CDN requests; use swap.
- Single-line fields are 44 px tall with 16 px text and tabular numbers. Labels
  use 14 px text, a 1.5 line height, and a 6 px field gap. Multiline fields grow.
- Shared button minimum height/width is 44 px; standard button text is 14 px.
  Circular Dashboard controls explicitly keep equal width and height.
- Control radius is 10 px; action gaps are 8 px. Existing theme palettes remain.
- Diet, Recovery, and Workouts use `.date-navigation`: buttons align to the
  input's bottom, not the label/input wrapper. The label container fixes the date
  field width at 10 rem rather than the browser's intrinsic width. Toolbar actions
  align to fields.
- Multi-column forms align fields at the bottom even when labels wrap. Card
  headings do not carry an extra bottom margin beside an Edit button.
- Checkbox/radio/range controls are excluded from single-line field sizing.
  Workout checkboxes do not inherit text-field padding.
- Custom-metric creation and deactivation reuse the native shared `Modal`.
  Keyboard focus stays out of the background; Escape and dismissal restore the
  opener. These two dialogs retain backdrop dismissal without treating dialog
  padding as backdrop. Deactivation prevents dismissal while pending.

These rules are implemented in `frontend/src/index.css`, feature styles, and
`frontend/src/components/modal.tsx`. No API contracts, routes, or schemas changed.

### Theme and accessibility follow-up (6 October 2026)

- Removed Sand from the theme selector and theme tokens. Only Dark and Light are
  supported; a legacy saved Sand value resolves to Dark.
- The original metric modal focus issue was subsequently fixed by the shared
  native Modal. Browser tests cover focus containment, Escape dismissal, and
  restoring focus to the opener for custom-metric creation and deactivation.
- Responsive alignment is covered by fixture-backed browser checks across
  Diet, Recovery, Workouts, and the exercise library at 320, 390, and 1440 px
  in both supported themes. This is targeted regression coverage, not a complete
  WCAG audit.
- Follow-up browser verification passed: all 45 layout tests and all 4 focused
  Workout browser tests. The covered contrast check is limited to workout
  completion labels and calendar counts; it does not measure every text/surface
  pairing in the application. No layout or focus-containment regressions were
  found in the checked scope.

### Logging-first mobile pass (implemented)

- Workout Training places the set form and current set list before the exercise
  switcher on mobile. Exercise/session actions, group auto-advance settings, and
  workout duration controls are available under the collapsed **Workout options**
  disclosure. Workout calculators remain collapsed, and the optional set comment
  follows the primary save actions.
- Diet check-offs now precede the daily summary on mobile; the seven-day summary
  remains available below the checklist.
- Recovery check-off tools now precede daily and seven-day summary panels on
  mobile. Research context and caveats remain present; research details and the
  longer evidence explanation remain disclosure-based.
- Responsive browser tests assert these mobile ordering expectations and retain
  the existing workout logging/edit/delete and recovery check-off coverage.
- Local Light-theme before/after captures are in the ignored
  `.lavish/uiux-review/action-first-before-after/` gallery. Sample fixture content
  may differ across the before/after captures; compare layout and controls.

No API contracts, routes, schemas, or account data changed in this pass.

### Sleep duration target input (implemented)

- Replaced the native clock-time input with explicitly labeled Hours and Minutes
  number fields. The supported range remains 1 hour through 23 hours 59 minutes.
- Valid drafts preview immediately; incomplete or out-of-range durations cannot
  be saved. The existing preference and analytics contracts continue to use
  total minutes; no API, schema, or route changed.
- Route tests cover the saved-value conversion, minute-based save, recalculation,
  and invalid values. Playwright checks field alignment and page overflow at 390
  and 1440 px.
- Light-theme before/after captures are in the ignored
  `.lavish/uiux-review/sleep-duration-before-after/` gallery.

### Workout Calendar and Progress refinement (implemented)

- Calendar filters use aligned responsive columns, and training/planned markers
  share a compact line while the date button retains full accessible counts.
- Progress tables have a responsive table style so records fit the mobile card
  rather than inheriting the generic 360 px minimum width.
- Live-backend browser checks passed at 320, 390, and 1440 px. The local Light
  before/after gallery is `.lavish/uiux-review/calendar-progress-before-after/`.

### Chart presentation consistency (implemented)

- Metrics trends, Sleep Insights, Weight/Steps analytics, and Workout Progress
  share the `.chart-surface` inset frame (theme border/background, 12 px radius,
  and 12 px padding).
- Chart.js labels use the bundled app sans-serif at 12 px. Workout Progress uses
  the semantic chart grid, axis, line, and fill tokens; Sleep duration bars use
  the chart-line token while below-target bars remain warning-colored.
- Chart data, units, aggregation rules, numeric ranges, and sleep target meaning
  are unchanged. Fixture-backed visual checks at 390 and 1440 px found no
  horizontal overflow.
- The ignored Light-theme before/after gallery is
  `.lavish/uiux-review/chart-consistency-before-after/`.

### Nested Workout navigation (implemented)

- Exercise Overview has four clearly scoped sections: Statistics, Exercise
  history, Exercise progress, and Goals. The former separate Graphs and Records
  tabs were redundant because both used the same progress view.
- Exercise progress reuses the Overview exercise selection rather than showing
  a second exercise dropdown. The standalone Workout Progress page keeps its
  selector.
- Personal records remain available from the graph menu; the selected progress
  window remains authoritative, including windowed personal records. The date,
  route, and data contracts are unchanged.
- The ignored Light-theme before/after gallery is
  `.lavish/uiux-review/workout-navigation-before-after/`.

### Workout exercise library scanability (implemented)

- Exercise categories show the number of exercises currently visible after the
  active search, category, favorite, and archive filters are applied.
- Category heading, count, and Edit action stay aligned as a single row on
  mobile. Exercise selection, favorite, and edit actions remain available.
- Search, selection, favorites, and editing behavior are unchanged. Responsive
  fixture captures at 390 and 1440 px fit without horizontal overflow; the
  fixture harness made no API writes.
- The ignored Light-theme before/after gallery is
  `.lavish/uiux-review/workout-library-before-after.html`.

### Browser page titles (implemented)

- The browser tab title follows the active route, including each Workout view
  and human-readable metric slugs, with `Longevity` as the app name.
- Unknown paths receive a not-found title, and the HTML fallback title is no
  longer the Vite placeholder. No route paths or page content changed.
- Unit tests cover title mapping; the mocked browser layout journey verifies
  workout home and All exercises titles during navigation.

### Workout status labels (implemented)

- Home and History preserve separate session states (Finished / In progress)
  and set states (Completed / Planned), now with distinct, readable badge styles.
- Calendar retains compact T/P day counts and accessible full counts, with an
  explicit key: Completed training means at least one completed set; Planned
  means no completed sets, including empty drafts.
- Progress surfaces its existing Completed sets only scope as a status chip.
  No workout or set completion semantics changed.
- Fixture-backed Light captures at 390 and 1440 px fit without horizontal
  overflow and made no API writes. Gallery:
  `.lavish/uiux-review/workout-status-before-after.html`.

Separate dependency follow-up: font installation's audit reported two existing
high-severity development-only dependency groups (`brace-expansion` via linting
tools and `undici` via jsdom). The font packages introduce neither group. No
unrelated audit fixes were applied in this UI slice.

Keep data contracts, history/units, planned/completed semantics, superset behavior,
and research/coverage caveats intact. Use focused behavioral tests and responsive
visual checks when implementing. Record approved design rules here after the user
chooses the remaining direction; do not treat later recommendations as decisions.

## Review artifact policy

The user approved keeping the screenshots locally and excluding the review folder
from Git. Do not delete them while review is ongoing.

- Working report: `.lavish/uiux-review/index.html`.
- Screenshot assets and capture metadata: the same ignored directory.
- Portable visual snapshot: `.lavish/uiux-review/review-portable.html`, with local
  image assets embedded. This is also ignored and intentionally not versioned.
- Durable project memory: this concise Markdown summary, routed from `AGENTS.md`.

The working index alone depends on sibling screenshots. Keep the portable snapshot
outside Git because it contains the large visual archive. The ignored files are
local artifacts, not a backed-up or shared record; retain a separate backup if
long-term preservation is required.


## Dashboard review — 20 October 2026

The owner requests Light theme only for UI/UX work from now on. Use Light for
future reviews, mockups and proposed layouts. This preference does not itself
remove Dark mode from the implemented application.

The dashboard review artifact is local and ignored at
`.lavish/dashboard-review/index.html`, with a separate interactive
`proposed.html`. It uses the current app's tokens, bundled DM Sans/DM Mono and
actual existing local Pro-account tracker data. Current screenshots are from
1440px desktop and 390px mobile; additional layout checks cover 320px/768px.
No application changes or account-data edits are approved or implied by this
review. Feedback controls queue choices only on explicit submission.

Recommendations: show each measurement's date; replace the unlabeled carousel
with explicit metric discovery; compact daily tracker access and include
Stretching; update the AI link to describe Day/Week/Month suggestions; explain
and collapse individual source-entry history. The proposed three primary cards
and mobile tracker-first order are choices, with six cards/metrics-first offered
for feedback. Preserve quick-add controls, all metric records and all five
visible source entries. No invented scores, targets, physiological conclusions,
or uniform seven-day labels for unequal sparkline samples.

## Metrics catalog refinement — 20 October 2026 (approved and implemented)

The owner approved all four recommendations in the local Light-theme review at
`.lavish/metrics-review/index.html`. The screenshots use the existing local account's
10 built-in, one active custom, and three archived custom definitions; no account
records were changed during the review or subsequent real-account browser checks.

- Compact white rows replace dashboard-style catalog cards. Family colors remain
  in icon tiles; the main row opens history. Desktop uses two columns and mobile
  uses one column so long names and units fit. The mobile list can be longer;
  readability and custom-metric access are the intended improvements.
- All / Built-in / Custom / Archived filters include counts. All starts with custom
  metrics. The catalog reads definitions including inactive records through the
  existing endpoint so counts and generated identifiers include archives. The
  All count represents available definitions, not logged data.
  Creation uses a compact outlined rectangular “+ New metric” button directly
  after Archived in the filter row, wrapping naturally on narrow screens. The
  redundant available-count badge is removed. Creation stays accessible under
  every filter. Usage/quota remains beneath the Custom metrics
  heading (“1 of 10 used”). The standalone promotional creation panel was removed.
- Custom rows have a labeled native disclosure for Edit and Archive. Edit opens a
  shared native modal; cancelling discards drafts. Archive keeps confirmation and
  the existing deactivation behavior: preserve history, stop logging, free a slot.
  Restore invokes the existing reactivation operation. Modal focus returns to the
  persistent management disclosure, rather than a hidden menu action.
- Creation leads with Name and Unit, then required numeric minimum/maximum with
  “Allowed entry range, not a health target.” Identifiers are generated from the
  name, capped at 80 characters, and suffixed to avoid existing active/archived
  definitions. Advanced allows manual editing. Server uniqueness validation remains
  authoritative; identifier errors reveal Advanced and preserve the draft. No API
  contracts, route paths, database schema, quota rules, or existing identifiers change.

Review and implementation browser checks cover Light at 320/390/768/1440px,
filtering, archive visibility, modal focus, cancelled edits, identifier generation,
and invalid ranges. The review artifact remains a proposal snapshot; the app is the
implemented source of truth. Metric-detail charts were outside this review's scope.

## Distance detail — 20 October 2026 (proposals 02–04 implemented)

The local Light-theme review is `.lavish/distance-review/index.html`, with real
account captures and an interactive proposal. The owner approved proposals 02
(chart and summary), 03 (daily history), and 04 (manual-entry wording). Proposal
01 was initially excluded. A follow-up request now reduces the visible header to
Metrics / Distance and the existing Add Distance entry action; the repeated title,
category and loaded-record badge are removed. A visually hidden h1 remains.

- Distance defaults to 30 local calendar days. Its chart spans the first through last recorded
  dates in the selected range, trimming empty leading/trailing dates. Internal
  missing dates stay null, measured zero stays zero, and lines do not bridge gaps.
  The summary and coverage denominator still describe the full selected range.
  The owner initially restored the smooth green line and fill, then selected a
  bar chart. Distance now uses soft green daily bars with rounded tops. Missing
  dates stay blank; a minimum-height mark keeps measured zero visible. Transition
  animation remains disabled for Distance.
  Other metrics retain their existing chart mode and default range.
- Recorded total, daily average and recorded-day coverage replace Distance's
  Oldest/Latest/Delta cards. Total and average are rounded to one and two decimal
  places; individual readings retain the existing distance precision. Missing
  dates are excluded from the average; partial recorded days are disclosed.
- Daily history reuses the backend's existing daily summaries, newest first,
  with five days initially shown and expansion reset on range changes. Source
  records are a separate collapsed disclosure; its count describes loaded
  records (at most 50). Source timestamps remain explicitly UTC. Existing manual
  Edit/Delete, confirmation, numeric limits and backend source priority remain.
- Distance's shared native add dialog uses Add distance, Distance (km), Date and
  time, Notes (optional), and Save distance. Notes use a textarea. Submission,
  pending/error behavior, native focus containment and return are preserved;
  dialogs for other metrics keep their wording.
- Selected-date links retain their existing UTC semantics. Local calendar date
  iteration handles daylight-saving boundaries without adding or losing dates.

Validation: all 622 frontend tests pass, including ten additional Distance checks;
ESLint and production build pass. Read-only browser checks at 320/390/768/1440px
verify the actual account's 30-day totals, 7d/1y switching, daily/source expansion,
UTC date links, native add-dialog focus containment/return, and unchanged HRV
presentation. No API writes, page errors or horizontal overflow occurred. The
normal account was not seeded or reset. No API contracts, routes or schema changed.

Follow-up visual refinements: the range filter sits to the right of Daily distance,
with exact date bounds below. Source-record labels, timestamps and values align
left on both mobile and desktop. The 44px range controls stay beside the heading
at 320px; the heading may wrap there. Focused validation covers 57 Distance/detail
checks; lint, build and real-account responsive checks pass.

## Steps detail — 20 October 2026 (all four proposals implemented)

The approved Light-theme review is `.lavish/steps-review/index.html`. Steps now
shares the activity layout/calendar helpers with Distance; Distance retains daily
bars at every range and its existing entry wording.

- The compact header shows Metrics / Steps, Add steps, and the existing Pro-only
  Compare with Weight action. A hidden h1 preserves the page heading.
- The default is 30d. The 7d/30d views use daily green bars; 90d/1y sum daily
  records into Monday-based weekly bars. Tooltips show exact totals and recorded
  day counts; partial weeks are identified. Empty outer dates are trimmed,
  internal missing periods remain blank, and measured zero stays visible.
- Recorded steps, rounded daily average, and recorded-day coverage describe the
  entire selected range. Missing days are excluded from the average. Daily
  history remains daily even when the chart groups weeks, starts with five rows,
  and resets expansion when the range changes. Source records remain collapsed,
  left aligned, capped at 50 loaded records, and explicitly timestamped in UTC.
- The native Add steps dialog uses integer input, Date and time, optional notes,
  and Save steps. Existing validation, focus behavior, manual Edit/Delete, API
  payloads, source selection, and UTC selected-date links are preserved.

Validation: 629 frontend tests pass; lint and production build pass. Real-account
Steps browser checks at 320/390/768/1440px cover range switching, summaries,
history/source expansion, dialog focus, fractional-input rejection, selected-date
links, and unchanged HRV presentation. No API writes, page errors, or horizontal
overflow occurred. No API contracts, routes, schema, or normal-account data changed.

## Recovery — 20 October 2026 (proposal A implemented)

The Light review at `.lavish/recovery-review/index.html` compares the actual page
with A (compact checklist) and B (visual cards). The owner approved all of A.
The implemented page has a short header, one combined date/count/recent-days panel
above tools at every width, a single shared-tool checklist with blue icon tiles,
per-tool collapsed research, and a compact custom-tools panel with nearby Add tool.
The separate sidebar and repeated introductory research explanations are removed.
One About the research disclosure retains the source and interpretation limits.

The date picker keeps its full range. History stays anchored to today, includes
archived activity counts, and now explicitly shows distinct days with records.
The selected count still describes active-tool check-offs only. Loading is stated
while changing dates; writes remain confirmed by the server. Existing Pro creation,
custom logging after downgrade, modal draft/error/focus behavior and archive/restore
are preserved. No new target, readiness score, quota or backend contract is added.

Validation: all 633 frontend tests, ESLint and production build pass. Real-account
browser checks at 320/390/768/1440px cover the context-before-tools order, collapsed
research, past-day records, full date navigation, cancelled creation and modal focus.
No API writes, page errors or horizontal overflow occurred. The proposal artifact
remains the design comparison; the app is the implemented source of truth.

## Diet — 20 October 2026 (proposal A implemented)

The Light review at `.lavish/diet-review/index.html` compares actual screenshots
with compact sections (A) and a section browser (B). The owner approved all of A.
One combined date/count/week/Recorded foods panel precedes the checklist. Expanded
section lists use three columns on desktop, two on tablet and one on mobile.
Warm accents distinguish Diet from Recovery's blue; checked rows have a subtle
tint. Food creation stays at the section heading, section creation beside checklist
management. No food names, ordering, category membership or nutrition measures
are invented or changed.

Manage checklist reveals compact native item menus. Existing name/order editing,
archive/restore, archived-record undo and all-account creation remain; check-offs
are disabled in management mode. Edit dialogs return focus to the persistent menu
summary. Selected-day loading is explicit and the recent week stays today-anchored.

Validation: all 637 frontend tests, lint and production build pass. Focused browser
checks cover date alignment/context order and full Diet management/history/
dashboard journeys at 320 and 1440px. The browser fixture now supplies the profile's
existing estimated_bmr contract and selects the current Today's logs Diet row.
Real-account checks at 320/390/768/1440px have no writes, page errors or overflow.
No API, route, schema or backend changes were made.

Diet follow-up: the owner requested two section columns on smaller views too.
Tablet/mobile now retain two columns while desktop stays at three. Narrow layouts
hide initial tiles, stack section actions, wrap food names, and anchor each column's
management menus inward. Real-account checks at 320/390/768/1440px show no overflow
or writes; both focused creation/management browser journeys and build pass.

### Routines compared with FitNotes — 26 October 2026

Visual comparison only; no application layout changes or deployment in this review.
Inspected the official [FitNotes routines guide](https://www.fitnotesapp.com/routines/)
and eight linked screenshots covering creation, viewing, editing, exercise picking,
predefined sets, start selection and groups. Captured current React routine screens
with a populated Push/Pull fixture in Light/Dark at 390 × 844; no account data writes.

The current routine view puts the first exercise at approximately y=1,053px in
that fixture, after app/workout navigation, title, date, the explanation card,
selector and routine metadata. FitNotes shows exercises immediately in its smaller
reference viewport. This is evidence of content priority, not a normalized density
benchmark. Our long day dialog combines metadata, exercise selection, numeric order,
group settings and preset entry. The start preview repeats type/unit and carry
explanations for each exercise. Functional coverage does not imply visual parity.

Recommended direction, not yet implemented:

- One selected routine as the workspace, with selection in a compact toolbar;
  help/notes and routine management are secondary. Remember selection per owner/device.
- Compact day cards with Start in the header; rows show name and set count.
  Move detailed quantities into the set editor and start preview.
- Separate view/edit modes. Editing reveals contextual add/remove/reorder controls;
  numeric display ranks leave the normal UI. Preserve keyboard arrow alternatives.
- Focused day-details, exercise-picker, predefined-set and group dialogs, with
  visible Save/Cancel controls. A named group chooser replaces typing matching labels.
- Compact start selection, one carry-forward explanation, and date selection near
  Start. Pre-start quantity overrides are a distinct functional gap requiring API
  validation and stale-preview tests; current quantities are edited after starting.

Retain app typography, Light/Dark colours and accessible 44px controls. Blank fields
stay unknown, carry-forward stays explicit, starting creates planned work, and
routine edits/deletion preserve existing workouts. Hiding guidance requires a
visible Help/Info action. Desktop may place days side by side; phone layout stays
one vertical list. No pixel-for-pixel recreation of the older Android UI is needed.

The ignored local review is `.lavish/routine-comparison/index.html`; it includes
official reference images, actual fixture captures and a clearly labelled proposed
layout. Six comparison screens were checked at 390/1440px, image assets loaded,
Dark theme and local Add set preview worked, and no page overflow or JavaScript
errors were found. The prototype is not application implementation or regression
coverage. Follow-up implementation should use the existing TDD playbook.

### Compact routine implementation — 26 October 2026

The user approved implementing the comparison direction. The local implementation
now has the selected-plan toolbar, compact day headers/rows, separate edit mode,
focused picker/preset/group/day dialogs, named group reuse and a compact dated
start preview. Help holds routine guidance/notes. All routines/archives are a
secondary view. Selection persists per owner/device, with a safe fallback when
storage or a saved plan is unavailable. The one-time new-day picker state clears
on routine switches, so returning does not reopen setup.

Predefined-set drafts use an atomic PUT with the complete prior snapshot. Cancel
never writes; failed saves retain inputs, stale snapshots reject, and no generated
workout is changed. Direct exercise dragging commits on drop; the handle also
opens arrow controls for keyboard users. A pointer-capture capability guard
preserves that fallback in environments without pointer capture. Normal preset
fields retain nulls and zero weight. Pre-start quantity overrides remain a
separate follow-up to the approved layout slice.

Actual fixture captures in Light/Dark at 320/390/1440px show the first exercise
at about 367px on phones (390px comparison before: about 1,053px), and 331px on
desktop. The ignored local before/after gallery is `.lavish/routine-cleanup/index.html`;
the prior proposal remains at `.lavish/routine-comparison/index.html`. No account
data or staging resources were changed for verification.

Routine group layout correction (2026-10-26): user screenshots exposed stretched
radio controls in the initial routine group chooser. The shared workout input
rule set width 100%, with an exception only for checkboxes; a Chrome fixture probe
measured radio widths of 318–421px in a 510px row. Radios now receive the same
small-control sizing exception. The routine chooser itself uses full clickable
group rows with member names, a coloured rail and a checked membership marker.
A separate New group form has name, two rows of five 44px colour-swatch controls,
the current exercise, and fixed Cancel/Save actions. The palette is shared with
the workout group editor. Joining or unlinking stays in the chooser after success;
local creation cancellation never writes. Source screenshots remain the user's
FitNotes references. Actual fixture captures are in the ignored local
`.lavish/routine-groups/` folder; no account data or staging resources were changed.

### Calendar compared with FitNotes — 26 October 2026

Comparison only, following the user's request; no application changes. Read the
[official calendar guide](https://www.fitnotesapp.com/calendar/) and inspected all
14 non-icon screenshots. Captured the actual app with synthetic January 2018
workouts, planned/empty drafts and two sessions on one date, at 390/1440px in
Light/Dark. Account data was not changed. Source images show the documented
reference UI, not a hands-on verification of the latest Android release.

The current calendar grid starts around y=967px at 390×844, and 690px on desktop,
after app navigation, page preamble, day and month controls, filters, explanatory
text, status and category keys. Date selection is inconsistent: with January 12
selected, clicking January 10 opens its preview but keeps January 12 pressed in
the grid. The fixture reproduces this at both widths in both themes.

Recommended first slice: compact calendar-first toolbar; remove duplicated date
navigation; collapse filter form/guidance behind Filters/Info while showing active
chips; compact the keys; synchronize selected date when previewing. Existing
category dots, full-workout preview, exercise stats/overview, multi-session days
and completed/planned semantics should remain.

FitNotes also has an integrated Month/List switch, previous/next recorded-workout
navigation, optional persistent workout panel, multiple category Any/All matching,
numeric exercise comparisons, and display toggles for dots and list details. Our
separate WorkoutHistory lists session cards in a 90-day window and does not share
calendar filters or show exercise/set summaries. The calendar's inline callback
is used in the copy picker; the full Calendar exposes no workout-panel toggle.
Our category/exercise filters are single-select, with no weight/rep predicates.
Choices come from this month's saved occurrences, retaining selected labels when
browsing months. Keys/dots are not user-toggleable in the current calendar.

Second slice: shared Month/List filters with explicit range/pagination, navigation
between matching workouts, and optional desktop/tablet details panel. Third slice:
category Any/All and performance rules if needed. Numeric conditions must match
the same completed set and respect frozen type/units; plans and unknowns must not
be mistaken for achieved values. Multi-category All should match one workout,
not combine different sessions on a day. Retain owner-keyed, bounded reads and
full source previews after filtering. Continuous month scrolling, weekday-start
preference and verified record/comment indicators are lower-priority polish.

The ignored visual review is `.lavish/calendar-comparison/index.html`, with the
14 reference images, 20 actual app captures and measured evidence. It uses the
app's existing DM Sans and green Light/Dark themes. Different source viewport
sizes and fixture counts are explicit; the comparison is not a density benchmark.

Selection refinement should preserve read-only inspection: a local calendar
highlight can follow the inspected date without changing Home's working date;
Go to workout remains the explicit navigation action. The seven paired review
screens were verified across both source widths/themes, phone/desktop layouts,
image loading and enlargement, with no gallery page overflow or JavaScript errors.
No application test suite was rerun for this read-only comparison.


### Calendar cleanup — implemented locally, 26 October 2026

The comparison above records the previous layout. The new calendar puts the grid
at y≈328px on the same 390×844 fixture (previously ≈967px); desktop moves from
≈690px to ≈292px. Local inspected-date highlighting fixes the Jan 10 / Jan 12
mismatch. Month/List share filters and month-scoped matching-day navigation.
Filter/display/help dialogs remove the long preamble. Wide screens can enable
an inline workout panel; phones retain a popup with fixed footer actions.
Category Any/All and completed-set weight/reps filters are implemented alongside
owner/device display preferences. Planned entries remain explicitly labelled.

Actual fixture captures cover Light/Dark at 320/390/1440px in the ignored
`.lavish/calendar-cleanup/assets/` directory, with geometry/selection evidence in
`metrics.json`. They use synthetic data and demonstrate local implementation,
not production deployment. No page overflow or browser script errors were found.
