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
fixture APIs, not the user's account data. Main views were captured in Dark,
Light, and Sand at 390/1440 px; selected layouts also received 320/768 px probes.
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

Retain the existing identity and all three themes. Light is the recommended
reference for dense forms and tables; Dark and Sand remain supported choices.
The review artifact matches the project's existing CSS tokens, not an external kit.

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
