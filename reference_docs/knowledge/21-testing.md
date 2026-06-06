## 6. Testing

## Use When
- Load this when you need the testing pyramid, tool choices, CI expectations, or coverage targets.

## Source
- Derived from `reference_docs/knowledge/planning.md` section 6.

| Type | Tool | What | When |
|---|---|---|---|
| **Unit** | pytest + pytest-django | Models, services, serializers, validators | Every PR (CI) |
| **Integration** | pytest + DRF `APIClient` | Full API endpoint flows (auth → create metric → query analytics) | Every PR (CI) |
| **Sync Contract** | pytest + fixture payloads | Wearable upload idempotency, dedupe, sync cursors, replay requests | Every PR during R2/R3 |
| **Mobile** | Android unit/instrumented tests | Permission flow, Health Connect reads, upload retries, sync state | Every R2/R3 change and pre-release |
| **E2E** | Playwright | Login → log metric → see on dashboard → export data | Pre-release |
| **Performance** | Locust | Load test: 100 concurrent users, metrics CRUD + analytics queries | Pre-R3 launch |
| **Security** | pip-audit + bandit | Dependency vulnerabilities + code security patterns | Every PR (CI) |

**Coverage target**: 80%+ via `pytest-cov`, enforced in CI.

Current frontend testing checkpoint:
- the frontend now has a basic Vitest test harness
- the current setup uses:
  - `Vitest`
  - `jsdom`
  - `@testing-library/react`
  - `@testing-library/jest-dom`
  - `@testing-library/user-event`
- `src/test/setup.ts` configures shared frontend test setup
- dashboard route tests now prove protected-route behavior at `/`
- route-level tests also now cover the login route shell:
  - heading
  - email input
  - password input
  - submit button
- a focused component test now covers `LoginForm` submission behavior with typed values
- a focused component test now covers the current empty-submit guard for the login form
- route-level tests now also cover the current login orchestration behavior:
  - `/login` submits credentials to `loginWeb(...)`
  - route-level error message renders when `loginWeb(...)` rejects
  - login button disables while the route is awaiting the async login request
  - a previous login error clears after a later successful submit
  - successful login redirects to `/`
- a focused session test now covers the in-memory auth session layer:
  - access token can be stored
  - access token can be read back
  - access token can be cleared
- a focused `getMe()` helper test set now covers the current-user API helper contract:
  - uses the stored access token
  - sends the bearer token to `/api/auth/me/`
  - throws when there is no access token in session
  - preserves backend auth `detail` when the endpoint returns an auth error
  - falls back to a generic current-user error when no usable detail exists
- a focused `useMeQuery()` hook test set now covers the first TanStack Query-backed authenticated-user state:
  - returns the current user when `getMe()` succeeds
  - exposes an error state when `getMe()` fails
- a focused `restoreWebSession()` helper test now covers the initial web session bootstrap success path:
  - bootstraps CSRF through `/api/auth/csrf/`
  - refreshes the web session through `/api/auth/web/refresh/`
  - sends `X-CSRFToken`
  - relies on cookie transport with `credentials: 'include'`
  - stores the returned access token
- a focused `logoutWeb()` helper test set now covers the web logout helper contract:
  - posts to `/api/auth/web/logout/`
  - sends `credentials: 'include'`
  - sends `X-CSRFToken`
  - preserves backend error detail when logout fails
  - clears the in-memory access token after successful logout
- `AuthBootstrapGate` tests now cover startup-gate behavior:
  - children do not render while session restore is pending
  - loading UI is shown during bootstrap
  - children still render when session restore fails

Recommended frontend test progression from this checkpoint:
- keep using route-level tests to prove TanStack Router behavior
- keep route-level tests narrow and structural:
  - correct route renders for the current URL
  - expected screen-level elements are present
- keep form behavior tests at the reusable component boundary:
  - typed values propagate correctly
  - invalid empty submit is blocked
- add visible validation-message tests next so the form does not fail silently
- introduce `MSW` when frontend tests begin exercising auth API requests
- keep Playwright for later end-to-end verification of the complete login flow

Current frontend test classification:
- route tests are frontend integration/component tests, not pure unit tests
- `LoginForm` tests are component behavior tests
- `auth-api` tests are frontend API helper contract tests
- these tests verify UI structure and local user interaction behavior before backend integration exists
- real backend-connected frontend tests have not started yet

What the current frontend tests are proving:
- route tests prove that the correct routed screen renders for the active URL
- route tests also prove that expected screen-level elements exist, such as headings, inputs, and submit buttons
- `LoginForm` tests prove local component behavior:
  - typed values are captured
  - submit passes the expected values to the component boundary
  - invalid empty submit is currently blocked
- `auth-api` tests prove the frontend helper contract for the backend web login endpoint:
  - correct endpoint path
  - correct HTTP method
  - cookie-aware request transport with `credentials: 'include'`
  - access-token response parsing
  - backend `detail` preservation when available
  - generic fallback error when the response is unsuccessful and has no usable detail
- `getMe()` tests prove the frontend helper contract for the backend current-user endpoint:
  - reads the current access token from the session layer
  - sends `Authorization: Bearer <token>`
  - parses the authenticated user payload
  - rejects when session state is missing
  - rejects with backend error detail when available
  - rejects with a sane fallback error when detail is unavailable
- `useMeQuery()` tests prove the first Query-backed authenticated-user boundary:
  - the hook reaches success state when `getMe()` resolves
  - the hook exposes the current user payload through Query state
  - the hook reaches error state when `getMe()` rejects
- `restoreWebSession()` tests now prove the first frontend auth-bootstrap contract:
  - frontend bootstraps the CSRF cookie first
  - frontend then calls the web refresh endpoint with `X-CSRFToken`
  - access token restoration still relies on browser cookie transport for the refresh token
  - successful refresh stores the new access token in the session layer
- `logoutWeb()` tests now prove the frontend web logout helper contract:
  - frontend does not read the refresh token directly
  - frontend relies on cookie transport plus `X-CSRFToken`
  - successful logout clears the in-memory access token
  - unsuccessful logout surfaces backend error detail when present
- `registerWeb()` tests now prove the frontend web registration helper contract:
  - frontend posts registration values to `/api/auth/register/`
  - unsuccessful registration surfaces backend `detail` when present
  - unsuccessful registration falls back to a generic registration error when needed
- login route tests now prove route-level orchestration behavior:
  - route calls `loginWeb(...)`
  - route surfaces async auth errors
  - route disables re-submit while pending
  - route stores the returned access token before continuing the success path
  - route redirects after successful login
  - after the successful redirect to `/`, the protected dashboard `beforeLoad` fetches the current user through `getMe()`
- register route tests now prove route-level registration behavior:
  - route renders email and password inputs plus a submit button
  - route calls `registerWeb(...)` with typed values
  - route redirects to `/login` after successful registration
  - route surfaces backend registration errors
  - route disables the register button while pending
  - route clears previous registration errors after a later successful submit
- settings route tests now prove the first protected-route behavior:
  - unauthenticated/error state redirects to `/login`
  - authenticated state renders settings content and the current user email
- settings route tests now exercise the router-native auth guard:
  - `getMe()` is mocked at the API-helper boundary
  - the route uses the shared `requireAuthBeforeLoad` helper
  - the helper uses the router `queryClient` context
  - failed current-user resolution redirects before settings content renders
  - successful current-user resolution allows settings content to render
- dashboard route tests now prove the protected dashboard behavior:
  - unauthenticated/error state redirects to `/login`
  - authenticated state renders the dashboard at `/`
- dashboard route tests now also prove startup integration:
  - the protected dashboard waits for auth bootstrap before rendering
- protected-route route tests now exercise router-native auth for both `/` and `/settings`
- both protected routes delegate to the same `requireAuthBeforeLoad` helper, so behavior stays centralized while still being covered through route tests
- the older `RequireAuth` component guard has been removed, so there is no separate component-guard test target
- logout-flow route tests now prove the routed UI orchestration:
  - authenticated user can reach `/settings`
  - startup bootstrap is mocked so routed logout behavior is isolated
  - clicking `Logout` calls `logoutWeb()`
  - successful logout redirects to `/login`
  - failed logout keeps the user on `/settings` and shows the error
  - revisiting `/settings` after successful logout is blocked when the mocked auth state changes to unauthenticated
- current logout-flow route tests are now stronger than a pure hook mock:
  - `getMe()` is mocked
  - the real `useMeQuery()` hook still runs
  - a real `QueryClient` is used in the test render
  - the test router receives the same `context: { queryClient }` shape used by production router setup
  - tests that only need an already-authenticated route seed `queryClient.setQueryData(['me'], { email: 'user@example.com' })`
  - tests that need to prove router re-check behavior avoid seeding the cache so `beforeLoad` must call `getMe()`
  - post-logout route protection is therefore exercised through real query-hook behavior rather than a fully mocked `useMeQuery()`
  - revisiting a protected route after logout causes a fresh `getMe()` call, proving the `me` query is re-checked rather than only relying on the earlier redirect

What the current frontend tests are not proving:
- no real backend requests are being made yet
- no real frontend-to-backend auth request is being executed yet; the network boundary is still mocked
- no app-wide authenticated user bootstrap lifecycle is covered yet
- startup bootstrap is covered at the gate/component and route-integration level, but not yet as a full app-wide auth lifecycle with real backend responses
- only the success path of `restoreWebSession()` is covered so far
- logout route tests still mock the network/auth boundary through `getMe()` and `logoutWeb()`, so they are not full end-to-end Query invalidation proofs, but they are stronger than the earlier fully mocked `useMeQuery()` approach
- focused auth browser coverage exists for the main happy path plus key negative auth paths; broader non-auth browser journeys still need E2E coverage later

Current browser-level E2E checkpoint:
- Playwright auth smoke coverage now exists for the real browser happy path:
  - register
  - redirect to `/login`
  - login
  - reach dashboard
  - render backend-provided default metric definitions on the dashboard
  - submit a real Resting Heart Rate metric entry through the dashboard form
  - verify the metric-entry input clears after the backend mutation succeeds
  - verify the saved metric entry is visible in the dashboard as a unit-formatted value such as `58 bpm`
  - select the dashboard metric filter and verify the saved metric entry remains visible through the filtered read path
  - create a custom metric through `/metrics`
  - verify the custom metric is visible in the metrics catalog
  - verify the custom metric becomes loggable from the dashboard
  - log a value for the custom metric and verify the saved custom metric entry appears on the dashboard
  - deactivate a custom metric from `/metrics`
  - show archived custom metrics and verify the archived marker
  - reactivate the archived custom metric
  - verify the reactivated metric returns to the active catalog and dashboard logging flow
  - visit `/settings`
  - logout
  - redirect back to `/login`
- Playwright auth negative-path coverage now exists for:
  - failed login staying on `/login` and showing the backend invalid-credentials error
  - duplicate registration staying on `/register` and showing the backend duplicate-email error
- the current Playwright setup starts both the frontend dev server and the dedicated E2E backend runtime
- the frontend dev server proxies `/api/*` requests to Django on the E2E backend during E2E
- the current Playwright auth flow does not mock frontend network requests or backend auth behavior
- the current Playwright auth flow writes to `db-e2e/longevity_e2e`, not the live local development database
- Playwright calls `POST /api/testing/reset/` before the auth smoke test, so deterministic emails can be reused
- the E2E reset endpoint flushes mutable E2E state and then reseeds required system rows, including default metric definitions used by the dashboard
- the E2E reset endpoint is mounted only by `config.settings.e2e` through `ENABLE_E2E_TESTING_API=True`

What the auth E2E slice exposed that mocked tests did not:
- missing backend runtime wiring for `PII_ENCRYPTION_KEY`
  - the failure only appeared when a real browser registration request triggered encrypted email persistence in the running Django app
- missing Django `CSRF_TRUSTED_ORIGINS` configuration for the Vite frontend origin
  - the failure only appeared when the real browser issued `POST /api/auth/web/logout/` from `http://127.0.0.1:5173`
- missing local runtime/process assumptions
  - E2E also exposed port drift and backend availability issues that mocked unit and route tests cannot see
- reset-state behavior for seed data
  - the dashboard metric-definition check exposed that `flush` removes migration seed rows too, so E2E reset must restore default metrics after clearing user-created data

Practical lesson from this auth slice:
- mocked route/component/helper tests are good for frontend behavior and request-shape contracts
- backend API tests are good for endpoint logic in isolation
- neither layer proves that the real browser, Vite proxy, Docker-backed Django runtime, env wiring, cookies, and CSRF origin checks all work together
- that integration gap is exactly what the Playwright smoke test closed

Current auth test-layer distinction:
- frontend Vitest route/component/helper tests are still mostly mocked
  - route tests mock helpers such as `registerWeb()`, `loginWeb()`, `getMe()`, or `logoutWeb()`
  - helper tests often mock `fetch()` to prove request shape and error handling
- backend Django tests exercise real backend code paths, but inside the Django test environment
  - they do not prove the browser, Vite proxy, local Docker runtime, or dev-environment cookie/CSRF behavior
- Playwright E2E now covers the real integrated path
  - real browser
  - real frontend
  - real API requests
  - real Django app
  - real cookie and CSRF behavior
  - real database writes

Why mocks are still used heavily outside E2E:
- they are faster and more deterministic
- they isolate one behavior at a time
- they make TDD practical during implementation
- they keep failures narrow and easier to interpret
- they avoid making every frontend test depend on backend startup, database state, cookies, and CSRF configuration

Best-practice testing shape for this project:
- unit and focused frontend tests should keep using mocks/fakes where persistence is not the behavior under test
- backend integration/API tests should use a real test database
- browser E2E tests should use the real stack against the isolated E2E environment and database rather than the everyday local dev database

Current backend metrics testing checkpoint:
- `tests/test_metric_definitions.py` covers the first metrics API slice.
- The list endpoint requires JWT authentication.
- Authenticated users receive active system default metric definitions.
- Authenticated users also receive their own active custom metric definitions.
- Other users' custom definitions and inactive definitions are not returned by the default active-only list.
- `include_inactive=true` list tests prove the API includes the authenticated user's inactive custom metric definitions without leaking another user's inactive definitions or inactive system defaults.
- Authenticated users can create custom metric definitions.
- Custom metric-definition creation requires authentication.
- Custom metric-definition creation rejects duplicate slugs for the same user.
- Custom metric-definition creation rejects slugs already used by system default metrics.
- Custom metric-definition creation rejects invalid ranges where `max_value <= min_value`.
- Custom metric-definition creation rejects creating a fourth active custom metric under the temporary MVP entitlement limit.
- Custom metric-definition tests prove inactive archived custom metrics do not count toward the active custom metric limit.
- Authenticated users can partially update their own custom metric definitions, including inactive custom definitions for reactivation.
- Custom metric-definition update requires authentication.
- Users cannot update another user's custom metric definition; the API returns `404` because the detail queryset is user-scoped.
- Users cannot update system default metric definitions.
- Custom metric-definition slugs remain immutable during update, while still writable during create.
- Custom metric-definition update rejects invalid ranges where a submitted bound conflicts with the existing stored bound.
- Custom metric-definition tests cover soft deactivation and reactivation through `is_active`.
- Custom metric-definition tests prove reactivation is blocked at the active custom metric limit, while metadata updates to an already-active custom metric remain allowed at the limit.
- `tests/test_metric_entries.py` now covers the first metric-entry write slice.
- Authenticated users can create a manual metric entry for an active default metric definition by sending the metric slug.
- Metric-entry creation requires authentication.
- Metric-entry values must stay within the selected metric definition's min/max range.
- Users can create entries for their own active custom metric definitions.
- Users cannot create entries for another user's custom metric definitions.
- Inactive metric definitions cannot be used for new entries.
- Metric-entry list tests cover newest-first ordering.
- Metric-entry list tests prove users only see their own entries.
- Metric-entry list tests cover filtering by metric slug.
- Metric-entry list tests cover `from` and `to` recorded-at bounds.
- Metric-entry list tests cover explicit positive `limit`, invalid `limit`, and the backend default limit of `50`.
- Metric-entry detail tests cover updating an authenticated user's own entry.
- Metric-entry detail tests prove users cannot update another user's entry; the API returns `404` because the detail queryset is user-scoped.
- Metric-entry detail tests cover deleting an authenticated user's own entry.
- Metric-entry detail tests prove users cannot delete another user's entry; the entry remains persisted.
- Metric-entry update tests prove value range validation still applies during partial updates.
- The current metric-entry coverage does not yet cover cursor pagination or analytics queries.

Practical test-level guidance for the current frontend slice:
- use route tests for screen presence and router wiring
- use focused component tests for local form behavior
- use small API helper contract tests for `fetch`-based backend wrappers
- do not jump to mocked API or real backend integration until the local screen and form contract are stable
- once auth submission behavior is ready, add mocked-network integration tests with `MSW`
- once the full auth flow is stable, add Playwright end-to-end coverage for the real user journey

Current frontend metrics testing checkpoint:
- `metric-definitions-api.test.ts` covers the metric-definition API helper request shape and error behavior, including `includeInactive` query-string generation and conversion of backend `non_field_errors` into a useful frontend error message.
- `use-metric-definitions-query.test.tsx` covers the TanStack Query wrapper for metric definitions, including passing `includeInactive` through to the API helper.
- `use-create-metric-definition-mutation.test.tsx` covers custom metric-definition mutation and invalidation of metric-definition queries.
- `use-update-metric-definition-mutation.test.tsx` covers custom metric-definition update mutation and invalidation of metric-definition queries.
- `use-deactivate-metric-definition-mutation.test.tsx` covers custom metric-definition soft archive mutation and invalidation of metric-definition and metric-entry queries.
- `use-reactivate-metric-definition-mutation.test.tsx` covers archived custom metric reactivation and invalidation of metric-definition and metric-entry queries.
- `metric-entries-api.test.ts` covers `createMetricEntry()`, `getMetricEntries()`, `updateMetricEntry()`, and `deleteMetricEntry()` request shape, auth-token requirements, backend failure behavior, filter query-string generation including `limit`, and backend validation-detail preservation for entry updates.
- `use-metric-entries-query.test.tsx` covers the TanStack Query wrapper for metric entries.
- `use-create-metric-entry-mutation.test.tsx` covers manual metric-entry mutation and invalidation of metric-entry list queries.
- `use-update-metric-entry-mutation.test.tsx` covers manual metric-entry update mutation and invalidation of metric-entry list queries.
- `use-delete-metric-entry-mutation.test.tsx` covers manual metric-entry delete mutation and invalidation of metric-entry list queries.
- `metric-trend-chart.test.tsx` covers the Chart.js-backed trend component contract: accessible chart region, empty state, summary text, and latest-entry-per-local-day aggregation before chart config is built.
- dashboard route tests cover the first metric-entry form behavior: submit, input clearing after success, and visible error on failed save.
- dashboard route tests also cover rendering logged metric entries in the `Recent Entries` section with user-facing metric names, unit-formatted values, and readable timestamps.
- dashboard route tests cover that metric-card latest values use an independent unfiltered `useMetricEntriesQuery({ limit: 50 })` read, so recent-entry filtering does not hide card values for other metrics.
- dashboard route tests cover selecting a metric filter and passing the selected metric slug into `useMetricEntriesQuery({ metric, limit: 5 })`.
- dashboard route tests cover the default recent-entry read limit with `useMetricEntriesQuery({ limit: 5 })`.
- dashboard route tests cover metric-card links and recent-entry links to `/metrics/$slug`.
- dashboard route tests continued to pass after the responsive visual foundation work, so the UI restyle did not change the dashboard behavior contract.
- metrics route tests cover protected-route behavior, metric catalog rendering, catalog-row links to `/metrics/$slug`, custom metric creation submit payload, form clearing after success, visible backend validation errors, custom metric metadata updates, custom metric deactivation, visible deactivation errors, include-inactive catalog reads, archived custom metric separation, archived row non-link behavior, archived status markers, archived custom metric reactivation, and visible reactivation errors.
- metrics route tests also prove the active custom metric usage indicator excludes defaults and archived metrics, exposes an accessible status, and switches to the limit-reached warning state at `3 / 3`.
- metric detail route tests cover protected-route behavior, dynamic slug route rendering, metric-definition lookup, styled summary rendering, chart-backed trend overview rendering, metric-entry history rendering, inline entry update/delete orchestration, local edit validation for empty/non-numeric values, preserving the edit form on failed update, visible update failure errors, empty-state rendering, bounded `useMetricEntriesQuery({ metric, limit: 50 })` calls, range-filtered `useMetricEntriesQuery({ metric, from, limit: 50 })` calls, and stable range filter query keys.
- Metric-entry hook tests mock the API helper but use a real `QueryClientProvider`, so they verify Query behavior without requiring a running Django backend.
- Playwright E2E now submits a real metric entry through the browser against the isolated E2E backend/database, verifies the saved value appears in the dashboard flow, and exercises the metric filter dropdown.
- Playwright E2E now also creates a custom metric through `/metrics`, verifies it appears in the catalog, verifies it appears on the dashboard, and logs a custom metric entry.
- Playwright E2E now covers the custom metric archive/reactivate lifecycle: create custom metric, deactivate it, reveal archived metrics, verify the `Archived` marker, reactivate it, and verify it becomes loggable from the dashboard again.
- Playwright E2E now opens a metric detail page from the dashboard and verifies the detail URL, summary, latest value, entry-history heading, editing a saved entry, and deleting that entry back to the empty state.
- Playwright E2E continued to pass after the dashboard restyle, so the browser flow selectors still match the accessible labels/headings.

Latest local verification checkpoint:
- `npm run test` passed after adding active custom metric usage and limit-message coverage.
- `npm run build` passed with the active custom metric usage indicator.
- `npm run test:e2e` passed with 6 Playwright tests against the isolated Docker-backed E2E runtime.
- `docker compose exec web uv run pytest` passed with the active custom metric entitlement tests.

Frontend test code hygiene:
- route tests may start with repeated setup such as:
  - setting the URL with `window.history.pushState(...)`
  - creating a router with `createRouter({ routeTree })`
  - rendering `RouterProvider`
- that repetition is acceptable at first while the pattern is still being learned
- once several route tests share the same setup, extract a small helper so the tests stay readable without hiding intent

Current frontend coverage state:
- frontend coverage is not wired yet
- `vitest run --coverage` currently fails because `@vitest/coverage-v8` is not installed
- coverage should be added after the initial auth slice has a few more stable behaviors worth measuring

Current CI quality gate for the backend:
- GitHub Actions backend workflow is now in place
- the workflow currently runs:
  - `ruff`
  - `mypy`
  - `pytest`
- the workflow is triggered on backend-related pushes and pull requests
- the current backend CI workflow is green

### Wearable Sync Test Focus

When testing Samsung-sync behavior:
- Use canned Samsung / Health Connect fixture payloads in backend tests. Do not depend on live Samsung services in CI.
- Verify `upload_id` idempotency, `external_source_id` deduplication, cursor advancement, and replay behavior.
- Keep at least one manual device validation pass in the release checklist because full Samsung Health behavior is not realistically reproducible in CI.

### Task-Triggering Endpoint Tests

When testing Django endpoints that enqueue Celery tasks:
- mock `.delay()` at the import path used by the view
- do not depend on a live Redis broker or running Celery worker
- verify HTTP response shape and that `.delay()` was called correctly

### Encrypted-At-Rest Field Tests

When testing fields that should be encrypted in the database:
- do not rely only on ORM reads, because model field conversion may deserialize or decrypt values before assertions run
- use a raw database cursor and direct SQL to inspect the literal stored column value
- assert that plaintext is not stored directly in the database row
- keep deterministic test-only crypto settings in Django test settings instead of depending on developer-local `.env` values

What this proves:
- the persisted database value is not plaintext

What this does not prove by itself:
- key management is correct
- the encryption scheme is production-ready
- decryption paths work correctly in every application flow

Use this pattern for sensitive fields where storage-at-rest behavior matters, such as encrypted email storage on the custom user model.

### Custom User Foundation Checks

Before moving from the custom user model slice into auth endpoints, keep the following covered and green:
- creating a user normalizes email and populates the lookup hash
- the stored email column is encrypted at rest
- manager lookup by plaintext email resolves through the lookup hash
- Django authentication resolves through the custom backend with email + password
- superuser creation sets the required admin flags
- `makemigrations --check` reports no drift after model changes

For this project, test-only crypto settings should live in `config/settings/test.py` so the suite does not depend on a developer's local `.env`.

`config/settings/test.py` is the active Django settings module for pytest because `pyproject.toml` sets:
- `DJANGO_SETTINGS_MODULE = "config.settings.test"`

That means automated tests should rely on explicit test settings overrides instead of assuming local development settings or local shell environment state.

Deferred test database note:
- `config/settings/test.py` currently inherits `DATABASES` from `base.py`.
- With the current local `.env`, normal pytest runs use `DATABASE_URL=postgres://postgres:postgres@db:5432/longevity`.
- When pytest runs inside Docker Compose, `db` resolves and Django creates a separate test database from that Postgres connection.
- When pytest runs on the host, `db` may not resolve unless `DATABASE_URL` is overridden to a host-reachable database or SQLite.
- We are intentionally not changing this in the E2E isolation slice; revisit later with an explicit `TEST_DATABASE_URL` or dedicated test DB policy.

### Why These Were Integration Tests

The custom user foundation should be tested mostly at the integration level, not as isolated unit tests.

Why:
- the main risk is framework wiring, not just helper correctness
- the slice depends on Django model lifecycle hooks, database persistence, custom field behavior, auth backend configuration, and migration state all working together
- pure unit tests would miss failures such as using the wrong user model, not encrypting at the persistence boundary, or not actually wiring the custom backend into `authenticate()`

Use integration-heavy tests here to prove:
- Django is using the custom user model
- manager methods persist the intended state
- encrypted fields store ciphertext in the real database
- authentication resolves through the configured backend
- schema and migration state remain aligned

Use unit tests instead for small pure helpers or validators where framework wiring is not the main source of risk.

### Auth Endpoint Testing Notes

Auth endpoint tests in this project are API integration tests.

They should prove:
- routing reaches the intended endpoint
- DRF request parsing and response shaping work correctly
- serializer validation preserves the API contract
- view, serializer, model, and auth backend wiring all cooperate correctly

When refactoring auth endpoints:
- keep existing endpoint tests green while moving validation from views into serializers
- prefer DRF views for JSON API endpoints so `request.data` is available naturally
- treat serializer adoption as an internal refactor, not an excuse to drift the public API contract unless the tests are intentionally updated first

For JWT-based auth tests:
- keep a sufficiently long test `SECRET_KEY` in `config/settings/test.py`
- otherwise HS256 signing may emit insecure-key-length warnings
- fixing the warning in test settings is better than normalizing weak signing keys in the test environment

Current auth endpoint coverage includes:
- register happy path, duplicate email, required fields, invalid email, and Django password validation
- mobile login happy path JWT issuance, invalid credentials, and required fields
- web login returns only `access` in JSON and sets a `refresh_token` cookie
- csrf bootstrap endpoint sets the CSRF cookie
- mobile refresh succeeds with refresh token in request body
- mobile logout succeeds with refresh token in request body
- mobile refresh happy path for a valid refresh token
- mobile refresh invalid-token rejection
- web refresh happy path for a valid `refresh_token` cookie
- web refresh rotates the `refresh_token` cookie
- web refresh rejects cookie-based refresh attempts without CSRF
- web refresh succeeds with `refresh_token` cookie plus `X-CSRFToken`
- `me` happy path with bearer authentication
- `me` unauthenticated protection
- mobile logout blacklists a refresh token and prevents reuse at the mobile refresh endpoint
- mobile logout requires the `refresh` field and rejects missing input with `400`
- mobile logout rejects malformed refresh tokens with `400`
- web logout accepts the refresh token from the `refresh_token` cookie
- web logout clears the `refresh_token` cookie on success
- web logout rejects cookie-based requests without CSRF
- web logout succeeds with `refresh_token` cookie plus `X-CSRFToken`

For the login slice specifically:
- keep input validation in `LoginSerializer`
- keep the view focused on orchestration: validate input, call `authenticate(...)`, mint JWTs, and shape the HTTP response
- prefer serializer-based required-field handling over manually branching on missing keys in the view

For the refresh slice specifically:
- keep SimpleJWT token validation inside `TokenRefreshSerializer`
- keep the custom project views focused on transport and security rules for the explicit web/mobile split
- test the public refresh endpoint contract rather than re-testing the library internals at a lower level

Current auth foundation status:
- the backend suite now covers the explicit web/mobile auth transport split
- generic login, refresh, and logout aliases have been removed
- logout refresh-token revocation, cookie clearing, csrf bootstrap, and web csrf enforcement are covered
- current backend suite status at this checkpoint: `37 passed`

Frontend test harness note:
- route tests use `window.history.pushState(...)` to set the active URL before mounting `RouterProvider`
- `render(...)` from React Testing Library mounts the routed React tree into jsdom so assertions can target user-visible DOM output

Logging visibility note during tests:
- normal pytest output captures logs by default
- to see logs live during a focused run, use `-s --log-cli-level=INFO`
- this is useful when verifying newly added auth or request logging without waiting for a failure case

Refresh implementation note:
- a custom refresh view is justified once refresh-token transport must support `HttpOnly` cookies
- keep SimpleJWT token validation in `TokenRefreshSerializer`; customize only the transport/orchestration layer
- refresh-token rotation should be tested at the HTTP contract level by asserting the response updates the `refresh_token` cookie, not by reimplementing serializer internals in the test
- explicit CSRF enforcement may be needed in the custom view because a naive `@csrf_protect` attempt on the DRF function-based refresh endpoint did not produce the expected failing test behavior

Example:
- `tests/test_task_ping.py` patches `common.views.ping.delay`
- the view under test imports `ping` inside `common.views`
- patching `common.tasks.ping.delay` would be the wrong target for this test

### Example Walkthrough: `tests/test_task_ping.py`

Test file:
- `tests/test_task_ping.py`

Code:

```python
from unittest.mock import Mock, patch


def test_ping_task_endpoint_enqueues_task(client):
    mocked_result = Mock()
    mocked_result.id = "test-task-id"

    with patch("common.views.ping.delay", return_value=mocked_result) as mocked_delay:
        response = client.get("/tasks/ping/")

    assert response.status_code == 202
    assert response.json() == {
        "task_id": "test-task-id",
        "task_name": "common.tasks.ping",
    }
    mocked_delay.assert_called_once_with()
```

Line-by-line explanation:
- `from unittest.mock import Mock, patch`
  - Imports standard-library test helpers.
  - `Mock` creates a controllable fake object.
  - `patch` temporarily replaces a real object during the test.

- `def test_ping_task_endpoint_enqueues_task(client):`
  - Defines a pytest test function.
  - `client` is the pytest-django test client fixture used to simulate HTTP requests.

- `mocked_result = Mock()`
  - Creates a fake object that will stand in for the object normally returned by `ping.delay()`.

- `mocked_result.id = "test-task-id"`
  - Adds the `.id` attribute expected by the view.
  - The view reads `task.id`, so the fake result must provide it.

- `with patch("common.views.ping.delay", return_value=mocked_result) as mocked_delay:`
  - Replaces `common.views.ping.delay` only for the duration of the `with` block.
  - Any call to `ping.delay()` inside the view now returns `mocked_result`.
  - `mocked_delay` keeps a handle to the patched callable so the test can assert how it was used.
  - The patch target is `common.views.ping.delay` because the view looks up `ping` in `common.views`.

- `response = client.get("/tasks/ping/")`
  - Sends a test HTTP request to the Django endpoint.
  - The view runs, calls the patched `ping.delay()`, and returns a JSON response.

- `assert response.status_code == 202`
  - Verifies the endpoint returns `202 Accepted`.
  - `202` is appropriate because the task is queued for async processing instead of completed inline.

- `assert response.json() == {...}`
  - Verifies the exact JSON body.
  - `"task_id"` comes from `task.id`, which is why it becomes `"test-task-id"`.
  - `"task_name"` is the literal string returned by the view.

- `mocked_delay.assert_called_once_with()`
  - Verifies the endpoint attempted to enqueue the task exactly once.
  - Also confirms no unexpected arguments were passed to `.delay()`.

What this test proves:
- the endpoint responds with the expected HTTP status
- the endpoint responds with the expected JSON shape
- the endpoint calls `ping.delay()` exactly once

What this test does not prove:
- Redis delivered the message
- the Celery worker executed the task
- the task returned `"pong"`

Those runtime concerns should be verified separately through manual Docker checks, Android device validation, or broader integration tests.
