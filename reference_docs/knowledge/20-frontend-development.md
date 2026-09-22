## 5. Frontend Development (Parallel from R1)

## Use When
- Load this when you need the planned frontend stack, component direction, routes, API integration approach, state management, or responsive behavior.

## Source
- Derived from `reference_docs/knowledge/planning.md` section 5.

### Dark, Light and Sand appearance (September 21, 2026)

- The shared header has a compact theme selector with Dark, Light and Sand;
  Login/Register expose the same selector above their forms. Dark remains the
  default when no valid choice exists.
- `public/theme-init.js` applies `localStorage['longevity-theme']` to the root
  `data-theme` before React renders. It is a same-origin external script, so no
  inline-script CSP exception is needed. Keep it in the frontend build upload.
- `src/theme.ts` owns preference updates and subscriptions. The choice survives
  navigation, reloads and sign-out, and changes propagate to other open tabs.
  It is a browser preference, not a user-account setting or Android app setting.
- Storage failures fall back to dark on startup; switching still works for the
  current visit. Clearing the saved preference restores the default.
- CSS variables cover surfaces, text, controls, states, dialogs and SVG charts.
  Canvas charts read those variables through `chart-palette.ts` and redraw on
  theme changes, including axes, legends and tooltips.
- Light uses soft gray backgrounds, white cards, dark text and deeper green
  controls. Sand is a softer alternative requested because Light felt too bright:
  beige backgrounds, oatmeal surfaces, dark brown text and brown controls, with
  earthy green and muted blue charts. Sand has no bright white card surfaces.
  All three themes retain the shared responsive layout. Local only.

### Shared responsive layout (September 21, 2026)

- The application shell and navigation share a `70rem` maximum outer width.
  This is a ceiling, not a fixed width: pages fill the available space with
  responsive `1rem`–`1.5rem` side gutters.
- Dashboard, Metrics, metric details, Settings, and all three analytics pages
  use the same content edges. Removed narrower per-route and mobile caps.
- `PageHeader` owns title sizing, the breadcrumb row, description and wrapping
  actions. Long custom metric names wrap without widening the page.
- Login/Register retain focused, centered forms capped at 440px. Form dialogs
  share a 36.25rem maximum; confirmation dialogs use 30rem. Both shrink to the
  viewport and scroll vertically when needed.
- Loading/error sections use the shared content width. Unknown URLs show a
  matching Page not found view with a dashboard link.
- Changes are local only. Layout browser tests use mocked API responses and
  make no database changes; see `21-testing.md` for the standalone command.
- `PageHeader` renders the breadcrumb row only when a breadcrumb is passed,
  so pages without one no longer carry a 20px phantom row plus grid gap above
  the title. All authenticated titles share one size scale (the old dashboard
  compact-title override is removed). The layout suite asserts title height
  within each header variant (plain vs breadcrumb) rather than across
  different header compositions.

### UI/UX review fixes (September 22, 2026)

- `formatChartAxisTick()` in `metric-entry-formatters.ts` trims Chart.js
  interpolated-tick float noise (for example `7.200000000000001`) for
  unknown/custom metrics while leaving stored-value display untouched. The
  metric trend and Weight × Steps weight-axis tick callbacks use it; body
  weight keeps its 1-decimal rule and sleep keeps duration formatting. This
  resolves the tick-formatting follow-up noted below.
- Metric detail and Weight × Steps show a factual single-day note when fewer
  than two days of data exist, instead of a silent degenerate chart. The
  Weight × Steps weight axis now uses enforced min/max from observed values,
  so a single reading focuses the axis instead of rendering 0–90 kg.
- The Weight × Steps breadcrumb uses “Body Weight × Steps” instead of raw
  slugs, matching the Sleep Insights breadcrumb pattern.
- Zero sleep shortfall renders as “No shortfall” in the accent color instead
  of “0h 00m” in alert orange. The Settings empty billing panel uses quiet
  muted body copy instead of the 22px accent headline style.
- Auth pages align to the top with a clamped offset instead of vertical
  centering, removing the large void above the card on tall viewports.

### Metrics catalog cleanup (September 21, 2026)

- `/metrics` uses readable category/unit subtitles without slug badges or
  default labels. Custom rows show a small Custom label; archived rows retain
  their Archived label.
- Edit, Deactivate and Reactivate show short button text while accessible names
  retain the metric name. Edit and Reactivate use neutral styles; New custom
  metric remains the main catalog action.
- Custom metric quota is shown once as “used of limit custom metrics used”;
  the create dialog repeats this only when opened.
- Show archived / Hide archived exposes its expanded state, starts collapsed,
  and shows an empty message when there are no archived custom metrics.
- Mobile rows wrap actions below the metric name. API routes, stored slugs,
  quota enforcement, edit and archive/reactivate behavior are unchanged.
- The catalog groups active metrics into “Default metrics” (built-in) and
  “Custom metrics” (yours) sections with an empty-state prompt when no custom
  metric exists. Row links use a chevron marker, and row-level Deactivate is a
  neutral secondary action (archiving is reversible; the confirm dialog keeps
  the danger styling). Verified with the catalog component tests and local
  browser layouts; this is a local frontend change, with no cloud deployment.

### Current redesign checkpoint (September 21, 2026)

- The first `longevity-redesign-v21` implementation slice is local only; it has
  not been deployed.
- The root application shell now distinguishes public authentication routes
  from authenticated routes. Signed-in navigation shows Dashboard, Metrics,
  Settings, a current-user initial, and the shared Logout action. Login and
  Register are hidden from authenticated navigation.
- Login and Register now use the focused `longevity-redesign-v21` auth-card
  layout locally. Public auth routes hide the global application header while
  keeping an in-card longevity link and direct navigation between both forms.
- Auth forms keep their existing API calls and redirects, expose errors as
  accessible alerts, and supply browser autocomplete metadata. Registration
  guidance reflects the validators currently enforced by the registration
  serializer: at least eight characters and rejection of common or
  numeric-only passwords. The configured similarity validator is not effective
  until registration validation supplies a user instance.
- The local Metrics catalog now follows the `metrics-catalog-v2` layout while
  preserving the existing definition, usage, create, update, deactivate, and
  reactivate API contracts. Custom metric creation uses a quota-aware dialog;
  creation failures keep entered values visible.
- Custom metric deactivation now requires confirmation and explains that
  existing entries are preserved. Failed deactivation remains in the dialog
  with the backend error. Default metrics remain read-only.
- The Metrics catalog loading state now uses an accessible skeleton layout
  that respects reduced-motion preferences. Catalog toolbars, dialogs, forms,
  and rows collapse for narrow screens.
- Logout is owned by the shared shell. The former duplicate Settings-page
  logout action was removed while preserving the existing secure logout,
  current-user cache removal, and redirect behavior.
- Dashboard metric cards now use the reusable
  `src/features/metrics/dashboard-metric-card.tsx` component. Each card keeps
  inline logging and adds an accessible sparkline when at least two fetched
  values exist. Sleep Duration is the featured card.
- Dashboard sparklines use the existing bounded 50-entry dashboard query and
  order each metric's points chronologically. They do not add an API request.
- At widths up to 680px, dashboard metric cards render in one column. Inputs
  use `min-width: 0` and `max-width: 100%` so native datetime controls remain
  inside the card.
- The local metric-detail view now carries the `metric-detail-body-weight-v2`
  structure across the generic `/metrics/:slug` route: a Metrics breadcrumb,
  full metric metadata, and a selected-range badge sit above the existing
  summary, trend, and history sections.
- Entry history displays saved notes. Manual numeric edits use the metric
  definition's minimum and maximum; Body Weight uses a `0.1 kg` step.
- Every active metric can be logged from its `/metrics/:slug` detail page.
  Numeric metrics use a value, measurement date and time, and optional note;
  Sleep Duration uses bedtime, wake time, and an optional note while the
  backend calculates duration. The shared dialog enforces the metric
  definition's accepted range before calling the existing metric-entry API and
  preserves form values after a failed save.
- Deleting a manual entry now requires confirmation and explains that the
  action is permanent. A failed deletion stays in the dialog with the backend
  error. Synced entries remain read-only.
- The local `/analytics/weight-steps` protected route now implements the Pro
  comparison prototype against a real server-side analytics contract. It
  supports 7, 30, and 90-day ranges. The dual-axis chart uses blue bars for
  daily Steps, subdued points for observed daily Weight, and a primary green
  line for the server-computed trailing seven-day mean of daily Weight (each
  point averages that day plus the 6 days before it, including pre-range
  lookback days). The mean renders with hollow markers and straight segments
  so it visibly passes through its own points next to the solid daily-weight
  dots. The page states this plotting rule in a short explainer so
  the line is not mistaken for a fit through the dots. Complete
  calendar rows preserve missing-day spacing, the Weight axis focuses on the
  observed range, and summary cards distinguish paired, Weight, and Steps
  coverage. Loading, empty, and error states remain accessible.
- The Body Weight and Steps detail pages expose reciprocal comparison links
  only when the current plan reports `analytics_enabled=true`. Django
  independently enforces the same entitlement and returns `403` to Free
  requests.
- Dashboard **Pro Insights** is the primary discovery point for paid analytics
  and links entitled users to **Weight × Steps**, **Sleep Insights**, and
  **Consistency & Coverage**. Body
  Weight, Steps, and Sleep Duration retain contextual secondary links; Free
  users see none of these links.
- Comparison wording avoids causal claims. Data coverage describes available
  overlap and tracked days; it does not claim that movement caused weight
  change.
- The local `/analytics/sleep` protected route summarizes the latest record for
  each of seven UTC wake dates. It shows nightly duration bars with readable
  per-bar duration labels (under-target values highlighted), six short-labeled
  summary tiles (average sleep, shortest night, under target, coverage, average
  bedtime/wake time) plus one shared local-timezone footnote, and per-night
  values in the chart's accessible name. The target help text wraps below the
  control instead of crowding it. Users can
  preview a changed nightly target immediately and explicitly save it to their
  account. The persisted value loads across refreshes and devices; saving,
  saved, and failure states are visible and accessible.
- Sleep shortfall is labeled as an estimate. It adds only the tracked nights'
  positive `target - duration` differences, does not count missing nights as
  zero, and does not claim that longer nights physiologically repay shorter
  nights.
- The local `/analytics/consistency` protected route displays the backend's
  complete seven-date UTC presence grid for every active available metric. It
  shows factual metric coverage, dates with any data, the most tracked metric,
  each metric's tracked-day count, a streak bounded to the visible window, and
  its latest entry timestamp. It links each row to metric detail and includes
  accessible loading, error, and empty states. It deliberately avoids a generic
  stale or on-track label because expected tracking frequency varies by metric.
- Every presence cell is a keyboard-accessible date deep link to
  `/metrics/$slug?date=YYYY-MM-DD`. Metric detail validates that search value,
  requests entries using exact UTC day bounds, replaces the range controls with
  a selected-date indicator, and seeds the manual-entry dialog from that date.
  This exposes every entry when a metric has multiple records on one date and
  gives missing dates a direct path to manual entry.
- Consistency also shows a factual **Needs attention** section. Steps and Sleep
  appear after two UTC calendar days without an entry; other metrics appear
  after seven days only if they have previously been used. The copy states the
  actual age of the latest record and links to metric detail. It does not claim
  that the metric is clinically stale or invent a wearable provider.
- The local Settings route now follows the `settings-subscriptions-v2` visual
  structure while preserving the current subscription, Checkout, and Customer
  Portal contracts. Current-plan and plan-catalog loading use accessible
  skeletons that respect reduced-motion preferences.
- Settings derives its subscription status label from backend state, keeps
  scheduled cancellation explicit, and surfaces wearable connection,
  analytics, and CSV-import entitlements from the existing plan contract.
  Loading and mutation failures render as accessible inline alerts.
- CSV export is now in **Settings → Data & Privacy → Export health data**.
  Pro opens a native dialog with metric selection (including archived metrics)
  and optional local-calendar **Export from / Export to** fields. Free sees a
  Pro explanation and **View plans** link. Entitlements that are loading or
  unavailable have separate states. Django still independently returns `403`
  for an unentitled request.
- With no filters, the export contains the full metric-entry history. The
  browser converts local date boundaries to UTC for the existing `from`/`to`
  API parameters, rejects inverted ranges, uses the in-memory bearer token,
  downloads `longevity-metrics.csv`, and displays success or a safe retry error.
  Controls are disabled during download. Recent Entries filtering is independent.
- The September 21 local visual refinement puts Sleep, Steps and Weight first,
  uses compact cards and neutral reading colors, removes technical slugs from
  cards/detail headers, and places metric-detail range controls above charts.
  Dashboard Add entry and detail Add entry share `metric-entry-dialog.tsx` and
  `metric-entry-input.ts`; dates, notes and validation follow the same behavior.
  `components/modal.tsx` supplies native focus containment and Escape handling.
- Sources on cards/detail summaries refer to measurement time, not sync time.
  Sparklines remain bounded by the 50-entry dashboard query and are labelled
  **Recent readings**. Pro Insights uses descriptive destinations and a sleep
  review prompt without claiming a computed personal recommendation.
- Typography, controls, cards, focus indicators and dark browser controls were
  refined across existing routes. The design is local only. Web Sync Now remains
  reference-only; Logout remains in the shared authenticated shell.
- `frontend/longevity-redesign-v21` is design reference material and is
  excluded from ESLint and Prettier checks; its handoff files are not compiled
  into the application.

### 5.1 Clients
- Web dashboard: React (Vite + TypeScript)
- Samsung-sync companion app: Kotlin Android app (R2/R3)
### 5.2 Component Library
- UI primitives: `shadcn/ui`
- Metric Cards (glassmorphic, colored left border)
- Charts (`chart.js` directly through canvas for metric detail trends)
- Form inputs (metric logging modal)
- Navigation (side nav desktop, bottom tabs mobile)
- Samsung sync status cards, permission prompts, and replay/error states

### 5.3 Routing: TanStack Router
- Use `TanStack Router` for the web app routing layer.
- Prefer route-based layouts and protected routes for the auth shell.
- Use route-level lazy loading/code splitting for heavier pages.
- `/` → Dashboard
- `/metrics/:slug` → Metric detail
- `/settings` → Profile, Samsung sync status, subscription
- `/login`, `/register` → Auth pages

Current frontend routing checkpoint:
- the Vite plugin-based TanStack Router setup is now in place
- `src/main.tsx` bootstraps React and renders `RouterProvider`
- `src/routes/__root.tsx` provides the current top-level layout shell
- the route skeleton currently includes:
  - `/`
  - `/metrics`
  - `/metrics/$slug`
  - `/login`
  - `/register`
  - `/settings`
- `src/routeTree.gen.ts` is generated from the file-based route modules and should not be edited by hand
- production builds are already code-splitting these route files into separate chunks

Current routing/auth checkpoint:
- `/` is now treated as an authenticated dashboard route
- `/` and `/settings` now use router-native auth protection
- protected routes use the shared `requireAuthBeforeLoad` helper in `src/features/auth/require-auth-before-load.ts`
- `requireAuthBeforeLoad` uses TanStack Router `beforeLoad` context and `context.queryClient.ensureQueryData({ queryKey: ['me'], queryFn: getMe })`
- if the current-user query cannot be resolved, protected routes redirect to `/login` before rendering route content

### 5.4 API Integration
- Web: central API client + `TanStack Query` for server state, caching, retries, and invalidation
- Avoid scattering raw `fetch()` calls across components
- Prefer query hooks and targeted mutations around the backend API contract
- Android: same REST API with JWT auth plus idempotent upload endpoints for sync batches

Current build order:
- web frontend comes before the Android companion app
- the first frontend slice should connect to the already-implemented web auth backend
- manual metric entry and dashboard reads should be implemented on web before Health Connect sync work begins

First web slice:
- `GET /api/auth/csrf/`
- `POST /api/auth/web/login/`
- `POST /api/auth/web/refresh/`
- `POST /api/auth/web/logout/`
- `GET /api/auth/me/`
- access token kept in memory on web
- invalidate or refetch `me` after login, logout, and refresh transitions where needed

Role of `GET /api/auth/me/` on the frontend:
- the access token is only the client-held credential
- `GET /api/auth/me/` is the backend-confirmed source of truth for the current authenticated user
- the frontend should not treat "we have a token string" as the same thing as "we know who the user is"
- `me` is what the frontend should use to:
  - confirm the stored token is still valid
  - know which user is currently authenticated
  - populate authenticated UI such as current user email
  - drive protected-route decisions
  - recover cleanly from invalid or expired auth state by clearing session when `me` fails

Practical auth model:
- access token in memory = credential for authenticated requests
- `GET /api/auth/me/` = current-user identity/resource fetched from the backend
- TanStack Query should own the cached `me` result
- the auth/session layer should own the access token itself

How the backend `me` endpoint authenticates in the current implementation:
- DRF runs authentication before `me_view` executes
- the project currently uses `rest_framework_simplejwt.authentication.JWTAuthentication` as the default DRF authentication class
- the frontend must therefore send `Authorization: Bearer <access-token>` when calling `GET /api/auth/me/`
- SimpleJWT validates the token and resolves the user
- `me_view` itself does not verify the JWT directly; it checks the already-populated `request.user`
- if `request.user.is_authenticated` is false, the endpoint returns `401`
- if authentication succeeded, the endpoint returns the current user payload, currently just:
  - `email`

Current frontend `me` helper checkpoint:
- the frontend now has a `getMe()` helper that:
  - reads the in-memory access token
  - calls `/api/auth/me/` with `Authorization: Bearer <token>`
  - throws if the token is missing
  - preserves backend auth `detail` when available
  - falls back to a generic current-user error when detail is unavailable

Current authenticated-user Query checkpoint:
- the frontend now has a `useMeQuery()` hook backed by TanStack Query
- `useMeQuery()` is the first frontend boundary that exposes current-user server state to routed UI
- this is the intended direction for authenticated UI:
  - session layer owns the access token
  - `getMe()` owns the HTTP contract
  - TanStack Query owns the cached current-user resource

Current web session bootstrap checkpoint:
- the frontend now has a `restoreWebSession()` helper in `src/features/auth/auth-bootstrap.ts`
- the helper restores a web session through the backend’s cookie-based refresh contract:
  - `GET /api/auth/csrf/`
  - read `csrftoken` from `document.cookie`
  - `POST /api/auth/web/refresh/` with:
    - `credentials: 'include'`
    - `X-CSRFToken`
- on success, the helper stores the returned access token in the in-memory session layer

Important transport split:
- the CSRF token is read by frontend JavaScript and echoed in `X-CSRFToken`
- the refresh token is **not** read by frontend JavaScript
- the browser sends the `refresh_token` cookie automatically on the refresh request because the request uses `credentials: 'include'`

Current checkpoint:
- `restoreWebSession()` exists and is covered
- it is wired into app startup through `AuthBootstrapGate`, so route rendering waits for one restore attempt before protected-route checks run

Current startup-gate checkpoint:
- the frontend now has `AuthBootstrapGate` in `src/features/auth/auth-bootstrap-gate.tsx`
- `src/main.tsx` now wraps `RouterProvider` with `AuthBootstrapGate`
- startup behavior is now:
  - render `Restoring session...`
  - run `restoreWebSession()`
  - continue rendering the routed app whether restore succeeds or fails
- this prevents protected routes from rendering or redirecting before the initial auth-bootstrap attempt finishes

Immediate next frontend step from this checkpoint:
- keep the current route skeleton
- continue replacing placeholder page bodies with auth-aware UI
- continue adding focused API helpers around backend auth endpoints
- keep protected routes behind router-native auth before adding real dashboard content

Current login-route checkpoint:
- `/login` now uses the reusable `LoginForm`
- the route calls the frontend `loginWeb(...)` helper on submit
- route-level auth failures are displayed on the page
- the login button is disabled while the async login request is in progress
- successful login stores the returned access token in the current in-memory session layer
- successful login currently redirects to `/`

Current register-route checkpoint:
- the frontend now has `registerWeb()` in `src/features/auth/register-api.ts`
- the helper:
  - posts to `/api/auth/register/`
  - sends JSON registration values
  - preserves backend `detail` on registration failure
  - throws a generic fallback error when no usable backend detail exists
- `/register` now has a real form instead of placeholder text
- the route calls `registerWeb(...)` on submit
- successful registration redirects to `/login`
- route-level registration failures are displayed on the page
- the register button is disabled while the async registration request is in progress
- previous registration errors clear on a later submit

Current logout helper checkpoint:
- the frontend now has `logoutWeb()` in `src/features/auth/auth-logout-api.ts`
- the helper:
  - reads `csrftoken`
  - posts to `/api/auth/web/logout/`
  - uses `credentials: 'include'`
  - sends `X-CSRFToken`
  - clears the in-memory access token on success
  - throws backend `detail` or a fallback error on failure

Current logout route-flow checkpoint:
- the routed logout flow is centered on `/settings`
- the route-level behavior now covered is:
  - authenticated user reaches `/settings`
  - user clicks `Logout`
  - route calls `logoutWeb()`
  - route removes the cached current-user query with `queryClient.removeQueries({ queryKey: ['me'] })`
  - route redirects to `/login`
- if logout fails, `/settings` stays rendered and shows the backend error detail
- after a successful logout, revisiting `/settings` re-checks `getMe()` through the router `beforeLoad` instead of trusting the earlier route state
- because the routed app is wrapped by `AuthBootstrapGate`, route-level logout tests mock `restoreWebSession()` so startup completes immediately and the test stays focused on logout behavior

Current protected-route checkpoint:
- after login, the frontend stores the returned access token in memory
- `getMe()` uses that bearer token to call `GET /api/auth/me/`
- `useMeQuery()` exposes the current authenticated user resource, currently including `email`
- protected-route checks now live in the shared TanStack Router `beforeLoad` helper `requireAuthBeforeLoad`
- `frontend/src/features/auth/require-auth.tsx` was removed after `/` and `/settings` migrated to router-native auth
- a logged-in user can render the protected dashboard route at `/`
- unauthenticated or errored current-user state redirects protected routes to `/login`

Current limitation:
- protected routes now wait for startup bootstrap, but there is still no dedicated route group/auth layout for all future protected routes
- `/` and `/settings` share the same `requireAuthBeforeLoad` helper, but the project does not yet have a shared TanStack Router auth layout route

Current metrics API integration checkpoint:
- `getMetricDefinitions()` fetches `GET /api/v1/metrics/definitions/` with the in-memory bearer access token.
- `getMetricDefinitions({ includeInactive: true })` fetches `GET /api/v1/metrics/definitions/?include_inactive=true` for archived custom metric management.
- `useMetricDefinitionsQuery(options)` exposes metric definitions through TanStack Query for dashboard reads and uses the options in its query key so active-only and include-inactive reads are cached separately.
- `getMetricUsage()` fetches `GET /api/v1/metrics/usage/` with the in-memory bearer access token.
- `useMetricUsageQuery()` caches the authenticated user's active custom metric usage under `['metric-usage']`.
- `createMetricDefinition()` posts custom metric definitions to `POST /api/v1/metrics/definitions/`.
- `createMetricDefinition()` keeps component-facing input camelCase, then maps it to the backend's snake_case JSON contract.
- `useCreateMetricDefinitionMutation()` wraps custom metric-definition creation in TanStack Query mutation state.
- Successful custom metric-definition creation invalidates `['metric-definitions']` and `['metric-usage']` so the catalog and entitlement indicator refresh after writes.
- Metric-definition API responses include `is_active`; the frontend uses this to distinguish active metric cards from archived custom metrics.
- `createMetricEntry()` posts manual metric entries to `POST /api/v1/metrics/entries/`.
- `createMetricEntry()` keeps the component-facing input camelCase, then maps it to the backend's snake_case JSON contract.
- `updateMetricEntry()` patches existing manual metric entries through `PATCH /api/v1/metrics/entries/{id}/`.
- `deleteMetricEntry()` deletes existing manual metric entries through `DELETE /api/v1/metrics/entries/{id}/`.
- `getMetricEntries()` fetches `GET /api/v1/metrics/entries/` with optional `metric`, `from`, `to`, and `limit` query parameters built through `URLSearchParams`.
- `useMetricEntriesQuery(filters)` exposes metric-entry reads through TanStack Query.
- Metric-entry query keys include the filters, so different metric/date-range reads get separate cached results.
- `useCreateMetricEntryMutation()` wraps manual metric-entry creation in TanStack Query mutation state.
- `useUpdateMetricEntryMutation()` wraps manual metric-entry updates and invalidates `['metric-entries']` on success.
- `useDeleteMetricEntryMutation()` wraps manual metric-entry deletes and invalidates `['metric-entries']` on success.
- The dashboard route renders a simple metric-entry form for each loaded metric definition.
- Successful metric entry submission clears the form input.
- The Sleep Duration card replaces the generic numeric input with local
  `datetime-local` Bedtime and Wake time controls, previews the calculated
  hours/minutes, rejects a wake time that is not later, and submits ISO interval
  bounds without a client-owned duration value.
- Failed metric entry submission renders the mutation error message.
- Successful metric entry mutation invalidates `['metric-entries']` so entry lists can refresh after writes.
- The dashboard route now renders a `Recent Entries` section backed by `useMetricEntriesQuery()`.
- Dashboard metric cards read latest values from an unfiltered bounded query, `useMetricEntriesQuery({ limit: 50 })`, so card values do not change when the user filters the recent-entry list.
- The dashboard `Recent Entries` section requests only the newest 5 entries with `useMetricEntriesQuery({ limit: 5 })`.
- The `Recent Entries` section has a metric filter dropdown that passes the selected metric slug while preserving the dashboard limit, using `useMetricEntriesQuery({ metric, limit: 5 })`.
- Recent entries resolve the metric slug against loaded metric definitions so the UI can show the user-facing metric name.
- Recent entries format the value with the metric unit, for example `58 bpm`.
- Known body-weight values use at most one displayed decimal across dashboard cards, recent/history rows, trend summaries, deltas, tooltips, and numeric chart labels. This presentation-only normalization turns binary floating-point artifacts such as `83.5999984741211` into `83.6 kg` without altering the API value or stored measurement. Unknown and custom metrics keep their current numeric representation until explicit display precision becomes part of the metric-definition contract.
- Recent entries keep the raw ISO timestamp in the semantic `<time dateTime="...">` attribute while displaying a readable UTC timestamp.
- The dashboard reads `useCurrentSubscriptionQuery()` so it can use `plan.analytics_enabled` for the first subscription-aware Pro value surface.
- Free users see a locked **Pro Insights** card that explains trend summaries require Pro.
- Pro users with `analytics_enabled=true` see a **Pro Insights** card where each
  destination (Sleep, Weight × Steps, Consistency) carries a one-line preview
  derived from the dashboard's existing bounded entry read: latest sleep plus
  trailing-7-day night count, latest weight plus latest steps, and days with
  any data in the trailing 7 UTC days. Empty states read “No sleep data yet”,
  “No weight or steps yet”, and “No recent data”. No extra API request.
- This first **Pro Insights** card is intentionally a scaffold, not the final paid analytics value. Return to it later with useful per-metric trend direction, deltas over 7/30 days, averages, anomaly flags, or similar higher-value summaries.

Current dashboard UI checkpoint:
- The dashboard now follows the dark mobile health-app wireframe direction from `10-wireframes-frontend-design.md`.
- The top desktop navbar is intentionally kept, even though the original wireframe uses a phone-style bottom nav.
- Small screens keep a compact phone-like layout with two-column metric chips.
- Desktop screens use a wider dashboard canvas with larger metric cards, larger current values, aligned form/button rows, and a roomier recent-entry panel.
- The current styling is plain CSS in `src/index.css`; Tailwind and `shadcn/ui` are still not installed.
- Use `shadcn/ui` later only if we intentionally add Tailwind/shadcn primitives for stable reusable controls such as Button, Input, Select, Card, Label, and Alert.

Current metrics page checkpoint:
- `/metrics` exists as a protected route.
- `/metrics` lists available metric definitions from `useMetricDefinitionsQuery()`.
- `/metrics` shows system default metrics and the authenticated user's custom metrics.
- each metric catalog row links to `/metrics/$slug`.
- `/metrics` includes the first custom metric creation form.
- The form submits through `useCreateMetricDefinitionMutation()`.
- Successful custom metric creation clears the form and invalidates metric-definition queries.
- Failed custom metric creation shows the backend validation message.
- The backend currently enforces a temporary 3-active-custom-metric limit.
- `/metrics` reads `{used, limit}` through `useMetricUsageQuery()` and shows `{used} / {limit} active custom metrics used`.
- The backend calculates usage from active user-owned custom metrics. System defaults and archived custom metrics do not count.
- The usage indicator switches to warning styling when `used >= limit` and exposes the text through an accessible status region.
- The frontend no longer hard-codes `3` or derives usage from the loaded metric-definition list. The backend remains the source of truth for display and enforcement.
- Custom metric metadata update is implemented for user-owned custom metrics.
- Custom metric deactivation is implemented as a soft archive action. It invalidates `['metric-definitions']`, `['metric-entries']`, and `['metric-usage']`; historical entries remain preserved.
- The metrics catalog includes a `Show deactivated custom metrics` toggle. When enabled, the route calls `useMetricDefinitionsQuery({ includeInactive: true })`.
- Active metrics remain in the normal available-metrics list and keep their `/metrics/$slug` detail links.
- Inactive custom metrics render in a separate archived section at the bottom of `/metrics`. Archived rows are visually muted, show an `Archived` marker, and intentionally do not link to `/metrics/$slug` because inactive metrics cannot be logged or opened as active detail pages.
- Archived custom metrics can be reactivated from the catalog through `useReactivateMetricDefinitionMutation()`, which PATCHes `isActive: true` and invalidates `['metric-definitions']`, `['metric-entries']`, and `['metric-usage']`.
- Reactivation failures render a visible row-level error and keep the archived row/action visible so the user can retry.

Current metric detail page checkpoint:
- `/metrics/$slug` exists as a protected dynamic route.
- The detail route reads `slug` through `Route.useParams()`.
- The detail route uses `useMetricDefinitionsQuery()` to resolve the user-facing metric definition for the slug.
- The detail route uses `useMetricEntriesQuery({ metric: slug, limit: 50 })` to fetch a bounded entry history for that metric.
- The detail route shows a styled summary section with latest value, tracked entry count, and accepted range.
- Tracked-entry counts use singular `entry` for one record and plural `entries`
  for every other count.
- The detail route shows a Chart.js line chart in the trend overview, plus oldest value, latest value, and delta for the selected result set.
- The trend chart is a daily trend, not a raw event plot. It collapses multiple entries on the same local calendar day to the latest `recorded_at` value for that day.
- Entry History remains event-level and continues to show every raw manual log, including multiple logs from the same day.
- Current chart aggregation is intentionally simple for the manual-tracking MVP. Future wearable/sync work should revisit metric-specific aggregation, for example heart-rate average/min/max ranges, weight latest value, and sleep nightly session totals.
- The detail route shows an entry-history section using the same dark card language as the dashboard.
- A Sleep Duration history row uses the API's read-only `period_start` and
  `recorded_at` bounds to show a local-time sleep window such as
  `1:00 AM–8:50 AM`. Its separate date is also local, avoiding a contradictory
  UTC wake time on the same row. Other metric rows retain their existing UTC
  timestamp display.
- Entry-history rows support inline edit/delete actions.
- Manual Sleep history editing uses Bedtime and Wake time controls and submits
  updated interval bounds; the backend recomputes duration.
- Inline edit currently supports value and notes while preserving the existing `recorded_at` timestamp.
- Inline edit blocks empty and non-numeric values before calling the update mutation.
- Failed entry updates keep the inline edit form open so the user can correct and resubmit.
- `updateMetricEntry()` preserves backend validation detail when available, for example metric range errors from the API.
- Entry update/delete errors are shown on the metric detail page as visible form errors.
- The detail route shows an explicit empty state when no entries exist, with a link back to the dashboard to log the first value.
- The detail route includes `7d`, `30d`, `90d`, and `All` range controls for entry history.
- Range controls pass a stable `from` timestamp into `useMetricEntriesQuery({ metric, from, limit: 50 })`; compute date filters only when the user selects a range, not during render, because query filters are part of the TanStack Query cache key.
- Do not call `new Date()` while building render-time query filters. If the computed timestamp changes every render, the TanStack Query key changes every render, causing a request/render/request loop.
- Dashboard metric cards and recent-entry metric names link to `/metrics/$slug`.
- Metric detail data is currently fetched through TanStack Query hooks inside the route component, not through TanStack Router loaders.
- Router/Query ownership and cache flow are documented in `reference_docs/knowledge/diagrams/frontend-router-query-data-flow.md`.

### 5.5 State Management
- Web:
  - `TanStack Query` for server state
  - `TanStack Router` for route state
  - plain React state for local UI state
  - React context only for small cross-cutting app concerns if needed
  - add Zustand only if a real client-state need appears beyond server-state and route-state concerns
- Android: native local sync state + background work coordination

Working rule:
- do not introduce a general-purpose global client store unless the app proves it needs one
- most current complexity belongs either to server state or route state, not a separate app-wide store

Auth/session split for the web app:
- `TanStack Query` owns backend-authenticated user state such as `GET /api/auth/me/`
- `TanStack Router` owns route protection and redirect flow
- plain React state owns form inputs and transient auth UI state
- a small auth/session layer owns the in-memory access token and auth actions such as login, refresh, and logout

Current router-native auth pattern:
- pass the app `QueryClient` into TanStack Router context
- import `requireAuthBeforeLoad` from `src/features/auth/require-auth-before-load.ts`
- assign `beforeLoad: requireAuthBeforeLoad` on protected route definitions
- inside the helper, call `context.queryClient.ensureQueryData({ queryKey: ['me'], queryFn: getMe })`
- redirect to `/login` when the current-user query fails
- keep route components using `useMeQuery()` when they need the current-user data for rendering
- use the query result from the route/component when the page needs current-user data, such as showing `currentUser.email`
- prefer this pattern for protected routes because it blocks unauthenticated route content before the component renders
- do not add a separate React auth context while TanStack Query already owns the shared current-user server state

Do not:
- store the access token inside query cache
- pretend the cached `me` object is the same thing as the access token/session state
- introduce a large global auth store before the app proves it needs one

Current Settings subscription UI checkpoint:
- `/settings` remains a protected route and now renders subscription state in addition to the user email and logout action.
- `getCurrentSubscription()` fetches `GET /api/v1/subscriptions/current/` with the in-memory bearer access token.
- The current-subscription contract includes `billing_portal_available`, billing-period dates, cancellation state, and the current local billing price; Settings renders **Manage subscription** only when the backend-derived portal flag is true.
- `useCurrentSubscriptionQuery()` caches the authenticated user's current subscription under `['current-subscription']`.
- `getSubscriptionPlans()` fetches the public `GET /api/v1/subscriptions/plans/` catalog.
- `useSubscriptionPlansQuery()` caches the active plan catalog under `['subscription-plans']`.
- Settings renders subscription information in card-style panels: current plan name, active custom metric limit, sync interval, current billing price/interval when present, and either `Renews <date>` or `Cancels <date>` from backend-owned subscription state.
- Settings renders Checkout upgrade options only for users who are not already managed through Stripe Customer Portal. When `billing_portal_available=true`, Settings hides Checkout upgrade buttons and tells the user to use **Manage subscription** for billing changes.
- The plan catalog exposes internal `SubscriptionPrice.id` values to the frontend; Stripe `provider_price_id` values remain server-side.
- `createSubscriptionCheckout()` posts `POST /api/v1/subscriptions/checkout/` with `{ price_id: <internal SubscriptionPrice.id> }`.
- `useCreateSubscriptionCheckoutMutation()` wraps Checkout creation in TanStack Query mutation state.
- A successful Checkout creation returns `{ url }`; Settings redirects with `redirectToCheckout(url)`, which calls `window.location.assign(url)` in the browser.
- `redirectToCheckout()` is a tiny browser-boundary helper so route tests can mock redirect behavior without trying to replace `window.location.assign`.
- `createSubscriptionPortal()` posts authenticated `POST /api/v1/subscriptions/portal/` without a client-supplied customer ID.
- `useCreateSubscriptionPortalMutation()` exposes portal creation state. Settings disables **Manage subscription** while the request is pending and displays the backend's safe error detail if it fails.
- A successful portal response returns `{ url }`; Settings redirects through the mockable `redirectToPortal(url)` browser boundary.
- `/settings?checkout=success` and `/settings?checkout=cancelled` show informational messages only. These query params do not grant entitlements; subscription changes still depend on trusted Stripe webhook processing.
- The `/settings` route validates the optional `checkout` search param through TanStack Router `validateSearch`, so TypeScript understands `checkout?: 'success' | 'cancelled'`.

### 5.6 Responsive
- Web: mobile-first CSS, 4-col → 2-col → 1-col grid
- Sync itself is Android-only in MVP; the web app surfaces status and synced data after upload

### 5.7 Tooling
- Build tool: `Vite`
- Language: `TypeScript`
- Validation: `Zod`
- Styling: `Tailwind CSS`
- Linting: `ESLint`
- Formatting: `Prettier`
- Testing later:
  - `Vitest`
  - `React Testing Library`
  - `MSW`
  - `Playwright` for end-to-end

Current frontend formatting checkpoint:
- `Prettier` is now installed in the frontend toolchain
- `package.json` now includes:
  - `format`
  - `format:check`
- `.prettierignore` excludes:
  - `dist`
  - `node_modules`
  - `src/routeTree.gen.ts`

Working rule:
- use ESLint for correctness-oriented linting
- use Prettier for code formatting
- do not hand-edit formatting in generated files such as `src/routeTree.gen.ts`

### 5.8 Code Splitting and Performance
- Do route-level code splitting from the start.
- Split heavier routes such as:
  - dashboard
  - settings
  - future metric detail pages
- Do not over-split tiny shared components.
- Reason:
  - reduce initial bundle size
  - keep auth pages and first load lighter
  - avoid unnecessary client-side waterfalls by coordinating route loading and data fetching carefully

### 5.9 React Compiler
- Do not make React Compiler part of the first frontend slice.
- Revisit it after the auth shell is working and the base frontend architecture is stable.

### 5.10 Deliberate Non-Choices
- Do not use `Drizzle` in the web frontend.
- Reason:
  - the frontend talks to the Django API, not directly to the database
  - `Drizzle` solves a different architecture problem
