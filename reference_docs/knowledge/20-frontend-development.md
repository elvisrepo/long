## 5. Frontend Development (Parallel from R1)

## Use When
- Load this when you need the planned frontend stack, component direction, routes, API integration approach, state management, or responsive behavior.

## Source
- Derived from `reference_docs/knowledge/planning.md` section 5.

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
- Failed metric entry submission renders the mutation error message.
- Successful metric entry mutation invalidates `['metric-entries']` so entry lists can refresh after writes.
- The dashboard route now renders a `Recent Entries` section backed by `useMetricEntriesQuery()`.
- Dashboard metric cards read latest values from an unfiltered bounded query, `useMetricEntriesQuery({ limit: 50 })`, so card values do not change when the user filters the recent-entry list.
- The dashboard `Recent Entries` section requests only the newest 5 entries with `useMetricEntriesQuery({ limit: 5 })`.
- The `Recent Entries` section has a metric filter dropdown that passes the selected metric slug while preserving the dashboard limit, using `useMetricEntriesQuery({ metric, limit: 5 })`.
- Recent entries resolve the metric slug against loaded metric definitions so the UI can show the user-facing metric name.
- Recent entries format the value with the metric unit, for example `58 bpm`.
- Recent entries keep the raw ISO timestamp in the semantic `<time dateTime="...">` attribute while displaying a readable UTC timestamp.

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
- The detail route shows a Chart.js line chart in the trend overview, plus oldest value, latest value, and delta for the selected result set.
- The trend chart is a daily trend, not a raw event plot. It collapses multiple entries on the same local calendar day to the latest `recorded_at` value for that day.
- Entry History remains event-level and continues to show every raw manual log, including multiple logs from the same day.
- Current chart aggregation is intentionally simple for the manual-tracking MVP. Future wearable/sync work should revisit metric-specific aggregation, for example heart-rate average/min/max ranges, weight latest value, and sleep nightly session totals.
- The detail route shows an entry-history section using the same dark card language as the dashboard.
- Entry-history rows support inline edit/delete actions.
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
- Settings renders the current plan name, active custom metric limit, sync interval, current billing price/interval when present, and either `Renews <date>` or `Cancels <date>` from backend-owned subscription state.
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
