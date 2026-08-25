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

Current backend production-runtime checkpoint:
- focused pytest contracts verify that the Docker image defaults to Gunicorn,
  selects `config.settings.prod`, and defines explicit worker, timeout,
  graceful-shutdown, and stdout/stderr logging behavior
- those tests also protect the local/E2E Compose override that continues to use
  Django's development server
- backend CI builds the real image and runs
  `scripts/smoke_prod_image.sh`, which proves the final stage is non-root,
  excludes `uv`, pytest, Ruff, mypy, `tests/`, and local runtime artifacts, makes
  the explicit Django migration command available, and asks Gunicorn to import
  the production WSGI application with deterministic non-secret values
- this smoke check does not connect to a database or replace the later
  migration-plus-readiness deployment smoke test

Current staging-runtime configuration checkpoint:
- `tests/test_staging_runtime.py` protects the canonical 14-key production
  inventory shared by Django and the host-side deployment loader
- focused tests reject malformed or non-object JSON, missing keys, blank
  values, and non-string values, while unexpected keys are omitted
- AWS CLI calls are stubbed; tests prove one `AWSCURRENT` retrieval, EC2
  instance-role-only credential discovery, and redacted retrieval failures
- the loader fetches exactly one secret snapshot per deployment attempt and
  passes values only through the child process environment, never by appending
  them to command arguments or writing an `.env`
- CLI tests prove one load feeds one deployment command and that expected
  configuration or child-process failures return controlled nonzero statuses
  without Python tracebacks or secret values
- backend CI discovers this file through `pytest tests`; the mypy target list
  includes `scripts`, so the host-side deployment module is type-checked too
- no focused test contacts AWS or starts Docker; the real migration-first
  Docker boundary belongs to the Step 8 production-like smoke test

Current health-contract checkpoint:
- focused endpoint tests prove liveness returns `200` without requesting a
  database cursor
- a PostgreSQL-backed integration test proves readiness returns `200` after a
  real query
- a simulated database failure proves readiness returns a fixed redacted `503`
  without leaking exception text
- route coverage proves the obsolete `/health/` contract returns `404`

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
  - concurrent callers share one CSRF-plus-refresh sequence
  - Web Locks serialize refresh-cookie rotation across browser tabs when supported
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
  - one tab uses a single in-flight promise, including under React `StrictMode` effect replay
  - browser tabs request the same `longevity-auth-refresh` Web Lock before rotating the shared cookie
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
- settings route tests now also cover the frontend subscription UI:
  - authenticated Settings renders the current subscription plan returned by `getCurrentSubscription()`
  - active paid plan prices returned by `getSubscriptionPlans()` are listed as upgrade options
  - default/free plans are excluded from the Available Plans upgrade region
  - clicking an Upgrade button calls `createSubscriptionCheckout({ priceId })` with the internal `SubscriptionPrice.id`
  - successful Checkout creation redirects through the mocked `redirectToCheckout()` browser-boundary helper
  - `checkout=success` and `checkout=cancelled` query params show informational messages without implying entitlement changes
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
- the `web-e2e` process and `config.settings.e2e` both replace developer Stripe
  values with fixed inert values; `STRIPE_OUTBOUND_API_ENABLED=False` also
  blocks Checkout and Customer Portal clients before any outbound call
- the subscription browser flow mocks the Checkout endpoint and hosted Stripe
  page; a real Stripe sandbox smoke belongs in a separate opt-in suite
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
- Authenticated users receive active system default metric definitions, including the seeded `steps` activity metric.
- Authenticated users also receive their own active custom metric definitions.
- Other users' custom definitions and inactive definitions are not returned by the default active-only list.
- `include_inactive=true` list tests prove the API includes the authenticated user's inactive custom metric definitions without leaking another user's inactive definitions or inactive system defaults.
- Authenticated users can create custom metric definitions.
- Custom metric-definition creation requires authentication.
- Custom metric-definition creation rejects duplicate slugs for the same user.
- Custom metric-definition creation rejects slugs already used by system default metrics.
- Custom metric-definition creation rejects invalid ranges where `max_value <= min_value`.
- A free-plan user is rejected when creating a fourth active custom metric.
- A Pro-plan user with limit 10 can create a fourth active custom metric, proving enforcement is plan-backed rather than globally hard-coded.
- Subscription model tests verify that plan entitlement fields persist, a subscription associates a user with a plan, and migrations seed the canonical free plan.
- The free-plan seed test reads `code="free"` from the migrated test database; independent model tests use other codes so they do not collide with the plan's unique code.
- Subscription service tests resolve current plans and ignore cancelled historical subscriptions.
- Subscription service tests prove a transition succeeds only when its expected subscription ID still identifies the current subscription, and that stale requests make no writes.
- Subscription service tests prove paid transitions store the selected price, reject inactive and cross-plan prices, and require a price for non-default plans.
- The same service suite proves a downgrade to the default Free plan succeeds with `price=None`, and all rejected transitions preserve the previous current subscription.
- `tests/test_subscription_concurrency.py` uses separate database connections and a controlled PostgreSQL row-lock race to prove two transitions based on the same Free subscription cannot both succeed; Free is replaced by Pro and the stale Premium request is rejected.
- `tests/test_current_subscription.py` proves the current-subscription endpoint requires authentication, returns the caller's subscription and plan entitlements—including server-owned automatic-sync policy—and does not leak another user's plan. The seeded Free response fixes one wearable slot, automatic sync disabled, and a 30-minute manual cadence.
- The current-subscription API tests also prove `PATCH` returns `405`, so an authenticated client cannot self-assign a paid plan through the read endpoint.
- `tests/test_subscription_plans.py` proves the public plan catalog returns the seeded Free plan and active paid plans while excluding inactive or retired plans.
- The plan-catalog response test fixes the public entitlement fields, deterministic default-first ordering, nested active price shape, and exclusion of inactive prices.
- Subscription model tests cover multiple billing prices per plan, selected price persistence, positive amounts, active-option uniqueness, and rejection of a selected price belonging to another plan.
- Registration tests prove an active free subscription is created and that user creation rolls back when the free plan is unavailable.
- The database constraint test proves a user cannot hold multiple current subscriptions.
- `tests/test_backfill_free_subscriptions.py` proves the local repair command supports dry-run mode, creates active Free subscriptions for users without a current subscription, and does not duplicate users who already have one.
- Custom metric-definition tests prove inactive archived custom metrics do not count toward the active custom metric limit.
- Authenticated users can partially update their own custom metric definitions, including inactive custom definitions for reactivation.
- Custom metric-definition update requires authentication.
- Users cannot update another user's custom metric definition; the API returns `404` because the detail queryset is user-scoped.
- Users cannot update system default metric definitions.
- Custom metric-definition slugs remain immutable during update, while still writable during create.
- Custom metric-definition update rejects invalid ranges where a submitted bound conflicts with the existing stored bound.
- Custom metric-definition tests cover soft deactivation and reactivation through `is_active`.
- Custom metric-definition tests prove reactivation is blocked at the active custom metric limit, while metadata updates to an already-active custom metric remain allowed at the limit.
- `tests/test_metric_usage.py` proves the authenticated usage endpoint returns the caller's active custom metric count and current plan limit for both free and Pro subscriptions.
- `tests/test_metric_definition_concurrency.py` uses real PostgreSQL transactions, separate thread connections, real authenticated API requests, and controlled synchronization to prove two concurrent creates cannot both claim the final active custom metric slot.
- The same concurrency module proves two concurrent archived-metric reactivations cannot both claim the final slot.
- These free-plan concurrency tests assert both the HTTP outcome (`201/400` for create, `200/400` for reactivation) and the database invariant of exactly 3 active custom metrics.
- The concurrency tests patch only synchronization points around the real usage/validation functions; URL resolution, JWT authentication, DRF views/serializers, ORM writes, transactions, and PostgreSQL row locks remain real.
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

Current Stripe testing boundary:
- Standard unit, service, and backend API tests must mock the Stripe network boundary and use fake test-setting credentials.
- Valid Stripe sandbox credentials are reserved for a small, explicitly enabled integration suite and must never be loaded by the default `pytest` run.
- Sandbox tests verify functional provider integration only; they must not be used for load, stress, soak, or high-concurrency testing.
- Load tests exercise our application with a configurable Stripe fake that simulates latency, provider failures, `429` responses, timeouts, and webhook retries.
- See `reference_docs/knowledge/38-stripe-testing-and-load-testing.md` for the complete policy and official Stripe references.

Current Stripe Checkout testing checkpoint:
- `tests/test_subscription_checkout.py` proves Checkout requires authentication and rejects missing, inactive, default-plan, duplicate-current-price, active-Stripe-subscription plan changes, and no-current-subscription inputs.
- The same suite proves successful Checkout calls the service and returns only the hosted Stripe URL.
- Service-level Checkout tests mock `StripeClient`, assert subscription mode, server-owned Stripe price IDs, metadata, and `CheckoutAttempt.id` as the Stripe idempotency key.
- Checkout service tests cover both customer branches: first-time users send `customer_email`, while users with a Stripe `BillingCustomer` send `customer` and omit `customer_email`.
- Checkout service tests prove each `CheckoutAttempt` stores the user's current subscription as `expected_subscription`.
- Service-level failure tests prove a provider failure marks the local `CheckoutAttempt` as `failed` while the API layer returns a generic `502`.
- No default checkout test contacts Stripe; sandbox coverage should remain opt-in and small.

Current Stripe Customer Portal testing checkpoint:
- `tests/test_subscription_portal.py` proves the portal endpoint requires JWT authentication and rejects users without a Stripe `BillingCustomer`.
- `tests/test_current_subscription.py` proves `billing_portal_available` is false without a Stripe `BillingCustomer` and true when the authenticated user has one; it also proves Free subscriptions expose null billing fields and paid subscriptions expose price, period, and cancellation state.
- The endpoint orchestration test mocks the portal service and proves the API returns only the hosted portal URL.
- The service test calls the real `create_customer_portal_session` function while mocking `StripeClient`; it verifies the stored Stripe customer ID and server-controlled return URL are sent to `billing_portal.sessions.create`.
- Provider-failure coverage proves Stripe details are not exposed and the endpoint returns a generic `502`.
- Default portal tests never contact Stripe and use fake credentials from test settings.

Current frontend subscription Checkout and Portal testing checkpoint:
- `subscriptions-api.test.ts` proves the frontend helper contracts for `GET /api/v1/subscriptions/current/`, including billing state fields, `GET /api/v1/subscriptions/plans/`, `POST /api/v1/subscriptions/checkout/`, and `POST /api/v1/subscriptions/portal/`.
- The checkout API helper test proves the frontend sends the internal `price_id` selected from the catalog and surfaces backend validation detail when checkout is rejected.
- `use-current-subscription-query.test.tsx` proves the current-subscription TanStack Query wrapper uses the `['current-subscription']` boundary.
- `use-subscription-plans-query.test.tsx` proves the plan catalog TanStack Query wrapper loads active plan prices.
- `use-create-subscription-checkout-mutation.test.tsx` proves the mutation forwards the selected internal price ID to the checkout API helper.
- `use-create-subscription-portal-mutation.test.tsx` proves the portal mutation delegates to the authenticated portal API helper.
- `settings-route.test.tsx` proves Settings renders current plan state, hides billing management without a Stripe customer, handles portal pending and error states, and redirects successful Checkout and Portal responses without contacting Stripe.
- `settings-route.test.tsx` also proves Settings renders paid subscription billing amount/interval plus renewal and scheduled-cancellation dates from the current-subscription response, and labels Free as manual 30-minute sync versus Pro automatic 15-minute sync.
- `settings-route.test.tsx` proves Stripe-managed subscriptions hide Checkout upgrade buttons and direct billing changes through **Manage subscription** instead.

Current Stripe webhook testing checkpoint:
- Missing Stripe signatures return `400` and do not process events.
- `tests/test_subscription_webhooks.py` proves invalid Stripe signatures return `400` and do not process events.
- Signature-verification coverage uses a real `stripe.Event` shape and proves the SDK object is recursively normalized to a plain dictionary before reconciliation; dictionary-only mocks would not catch this production boundary mismatch.
- Valid verified events are handed to `process_stripe_webhook_event`.
- `checkout.session.completed` confirms the matching local `CheckoutAttempt`, cancels the previous current subscription, and creates the replacement paid subscription.
- Duplicate Stripe event IDs are idempotent: a retried event is acknowledged without creating extra subscription history.
- Endpoint-level duplicate coverage proves an already-recorded provider event still receives `200` and does not create a second `StripeWebhookEvent`.
- Service-level duplicate coverage processes the same `checkout.session.completed` event twice and proves the subscription upgrade occurs only once.
- Missing Checkout metadata and mismatched provider Checkout Session IDs are recorded as seen webhook events but do not confirm attempts or change subscriptions.
- Cross-plan price metadata is recorded as a seen webhook event but does not confirm attempts or change subscriptions.
- Stale Checkout completions are recorded as seen webhook events but do not overwrite newer active subscriptions.
- Billing-customer conflict tests prove webhook completion cannot replace a user's existing Stripe customer or claim a provider customer already owned by another local user.
- Subscription-update coverage proves scheduled cancellation stores Stripe `cancel_at`, normalizes period-end cancellation into local `cancel_at_period_end`, updates the billing period, reconciles recognized Stripe item price changes, warns on unknown Stripe prices without changing the local price, and preserves the active paid plan.
- Subscription-update ownership coverage proves a matching provider subscription ID cannot be updated when the event's Stripe customer differs from the user's `BillingCustomer`.
- Subscription-deletion coverage proves a verified terminal Stripe cancellation replaces the ended paid subscription with an active Free subscription while retaining the paid row as history.

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
- `metric-usage-api.test.ts` covers the authenticated `GET /api/v1/metrics/usage/` request and response contract.
- `use-metric-usage-query.test.tsx` covers the TanStack Query wrapper and `['metric-usage']` cache entry.
- `use-create-metric-definition-mutation.test.tsx` covers custom metric-definition mutation and invalidation of metric-definition and metric-usage queries.
- `use-update-metric-definition-mutation.test.tsx` covers custom metric-definition update mutation and invalidation of metric-definition queries.
- `use-deactivate-metric-definition-mutation.test.tsx` covers custom metric-definition soft archive mutation and invalidation of metric-definition, metric-entry, and metric-usage queries.
- `use-reactivate-metric-definition-mutation.test.tsx` covers archived custom metric reactivation and invalidation of metric-definition, metric-entry, and metric-usage queries.
- `metric-entries-api.test.ts` covers `createMetricEntry()`, `getMetricEntries()`, `updateMetricEntry()`, and `deleteMetricEntry()` request shape, auth-token requirements, backend failure behavior, filter query-string generation including `limit`, and backend validation-detail preservation for entry updates.
- `use-metric-entries-query.test.tsx` covers the TanStack Query wrapper for metric entries.
- `use-create-metric-entry-mutation.test.tsx` covers manual metric-entry mutation and invalidation of metric-entry list queries.
- `use-update-metric-entry-mutation.test.tsx` covers manual metric-entry update mutation and invalidation of metric-entry list queries.
- `use-delete-metric-entry-mutation.test.tsx` covers manual metric-entry delete mutation and invalidation of metric-entry list queries.
- `metric-trend-chart.test.tsx` covers the Chart.js-backed trend component contract: accessible chart region, empty state, summary text, latest-entry-per-local-day aggregation before chart config is built, and body-weight float-noise formatting.
- dashboard route tests cover the first metric-entry form behavior: submit, input clearing after success, and visible error on failed save.
- dashboard route tests also cover rendering logged metric entries in the `Recent Entries` section with user-facing metric names, unit-formatted values, and readable timestamps.
- dashboard and metric-detail route tests prove a stored body-weight value such as `83.5999984741211` displays as `83.6 kg`, including latest cards, entry rows, trend statistics, and a computed `-3.4 kg` delta; this does not assert that persistence was rounded.
- dashboard route tests cover that metric-card latest values use an independent unfiltered `useMetricEntriesQuery({ limit: 50 })` read, so recent-entry filtering does not hide card values for other metrics.
- dashboard route tests cover selecting a metric filter and passing the selected metric slug into `useMetricEntriesQuery({ metric, limit: 5 })`.
- dashboard route tests cover the default recent-entry read limit with `useMetricEntriesQuery({ limit: 5 })`.
- dashboard route tests cover metric-card links and recent-entry links to `/metrics/$slug`.
- dashboard route tests cover subscription-aware Pro insights: Free users see a locked upgrade prompt, while Pro users with `analytics_enabled=true` see metric coverage and latest-update summaries.
- dashboard route tests continued to pass after the responsive visual foundation work, so the UI restyle did not change the dashboard behavior contract.
- metrics route tests cover protected-route behavior, metric catalog rendering, catalog-row links to `/metrics/$slug`, custom metric creation submit payload, form clearing after success, visible backend validation errors, custom metric metadata updates, custom metric deactivation, visible deactivation errors, include-inactive catalog reads, archived custom metric separation, archived row non-link behavior, archived status markers, archived custom metric reactivation, and visible reactivation errors.
- metrics route tests prove the usage indicator renders backend-provided `used` and `limit` values independently of the loaded definition list, exposes an accessible status, and switches to the limit-reached warning state when `used >= limit`.
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
- `npm run test:e2e` passed with 7 Playwright tests against the isolated Docker-backed E2E runtime.
- On 2026-07-16, `docker compose exec web uv run pytest -q` passed with `195` backend tests, `uv run ruff check` passed, and repository-wide `uv run mypy` passed across `79` source files.
- On 2026-07-27, the `MetricEntry.source_connection` foreign-key, external-record uniqueness, isolated wearable entry/batch validation, and strict receipt-input slices passed all `223` backend tests, repository-wide Ruff, the configured `uv run mypy` gate across `81` source files, migration-drift detection, and `git diff --check`.
- On 2026-07-28, duplicate external IDs within one wearable batch are rejected; all `224` backend tests, repository-wide Ruff, the configured `uv run mypy` gate across `81` source files, migration-drift detection, and `git diff --check` passed.
- On 2026-07-28, `SyncRun.payload_hash` storage and its backward-compatible empty default were added; all `225` backend tests, repository-wide Ruff, the configured `uv run mypy` gate across `82` source files, migration-drift detection, and `git diff --check` passed.
- On 2026-07-28, versioned canonical wearable payload hashing and non-finite value rejection were added; all `230` backend tests, repository-wide Ruff, the configured `uv run mypy` gate across `83` source files, migration-drift detection, and `git diff --check` passed.
- On 2026-07-28, the isolated atomic wearable-ingestion happy path was added; all `231` backend tests, repository-wide Ruff, the configured `uv run mypy` gate across `84` source files, migration-drift detection, and `git diff --check` passed.
- On 2026-07-28, exact wearable-upload retries became idempotent inside the ingestion service; all `232` backend tests, repository-wide Ruff, the configured `uv run mypy` gate across `84` source files, migration-drift detection, and `git diff --check` passed.
- On 2026-07-28, conflicting wearable-upload identity reuse and legacy blank-hash receipts gained explicit domain rejection; all `234` backend tests, repository-wide Ruff, the configured `uv run mypy` gate across `84` source files, migration-drift detection, and `git diff --check` passed.
- On 2026-07-28, identical external wearable records from a new upload became successful skipped entries instead of uniqueness failures; all `235` backend tests, repository-wide Ruff, the configured `uv run mypy` gate across `84` source files, migration-drift detection, and `git diff --check` passed.
- On 2026-07-29, mixed wearable batches gained direct imported/skipped counter coverage; all `236` backend tests, repository-wide Ruff, the configured `uv run mypy` gate across `84` source files, migration-drift detection, and `git diff --check` passed.
- On 2026-07-29, changed content under an existing wearable provider-record ID gained explicit domain conflict handling; all `237` backend tests, repository-wide Ruff, the configured `uv run mypy` gate across `84` source files, migration-drift detection, and `git diff --check` passed.
- On 2026-07-29, normalized wearable ingestion was wired into the authenticated upload endpoint with synchronous `201`, exact-retry `200`, and safe conflict `409` responses; all `240` backend tests, repository-wide Ruff, the configured `uv run mypy` gate across `84` source files, migration-drift detection, stale-reference grep, and `git diff --check` passed.

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

MyPy gate repair completed on 2026-07-14:
- The full CI command exposed `16` errors that smaller focused checks had not shown. Run the same repository-wide `uv run mypy` command used by CI before calling the type gate green.
- Stripe Checkout parameters now use Stripe's `SessionCreateParams` instead of `dict[str, Any]`. Because hosted Checkout still types `session.url` as optional, the service explicitly marks the local attempt failed and raises when Stripe returns no redirect URL; a regression test covers this behavior.
- Historical migration callbacks now type the migration registry as `Apps` and the schema editor as `BaseDatabaseSchemaEditor`; empty migration dependency lists receive an explicit element type.
- DRF `post()` handlers type requests as `Request`, and empty authentication-class declarations specify `list[type[BaseAuthentication]]` so MyPy does not have to infer from an untyped empty list.
- Serializer values originating from generic `validated_data` are narrowed to their known domain type before model attributes are accessed. Serializer `create()` methods declare their model return type.
- Login callers explicitly verify the invariant that a successful authentication result contains a non-null user before accessing it.
- Django `TextChoices` values passed to helpers expecting plain strings are converted explicitly when Django's generated choice typing is ambiguous.
- These fixes and the subsequent Health Connect provider/lifecycle plus `SyncRun` receipt work were verified with the complete backend gate: `ruff`, repository-wide `mypy`, `195` pytest tests, migration drift check, and `git diff --check`.

### Wearable Sync Test Focus

Immediate next wearable slice:
- The normalized wearable ingestion endpoint is implemented synchronously end to end: active owner scoping, strict nested validation, canonical hashing, atomic persistence, terminal counters, exact retry reuse, upload conflicts, record skips, and record conflicts.
- The thin Android companion app has completed its first physical-device vertical slice: live mobile authentication, connection registration, Health Connect weight permission/read, and a real Samsung-originated upload into Django and the React metric history.
- Model tests should prove provider/status choices, ownership, nullable `last_synced_at`, optional `last_error`, and timestamp behavior.
- API tests should prove authentication is required, list and status-detail responses expose only the caller's active connections, creation stores `request.user`, disconnect deactivates only the caller's connection and releases its slot, re-registration restores the same UUID, and invalid provider/server-managed values are rejected. Later trusted ingestion-service tests should cover sync-state updates.
- API tests now prove that the connection collection rejects unauthenticated requests, lists only the caller's connections, assigns new connection ownership from the JWT user, rejects `samsung_health` as a direct provider, and rejects creation when the plan limit is exhausted.
- Free-plan single-bridge creation, generic zero-limit rejection, active duplicate-provider, and client-supplied status/activation rejection are covered. New registration starts `pending`. Disconnect coverage proves authentication, owner-only soft deactivation, cross-user `404`, harmless repeated disconnect, same-UUID reactivation into `pending`, stale-error reset, and entitlement-slot reuse. List/status coverage hides inactive history. Additional server-managed-field cases remain on the immediate API test list.
- `SyncRun` model tests prove duplicate `(wearable_connection, upload_id)` rejection, allow the same upload UUID on another connection, verify the initial `received` state, timestamps, zero counters, and empty error/metadata values, and prove payload hashes are stored while receipt-only rows default to an empty hash.
- Upload API tests prove authentication, owner/active scoping, malformed UUID and missing-entry rejection, synchronous normalized Weight persistence, Steps interval/count persistence with `period_start < recorded_at`, an exact retry with `200`, both conflict types with safe `409` detail, and cross-upload identical-record skipping with terminal counters.
- Metric-entry relationship tests prove wearable entries reference a real connection, deleting an entry preserves its connection, direct hard deletion of a referenced connection is restricted, and user deletion cascades the user's connection and entry together.
- Metric-entry deduplication tests prove a repeated non-null `(source_connection, external_source_id)` pair is rejected, the same external ID is allowed on different connections, and manual null-source entries remain unconstrained.
- Wearable-entry serializer tests prove normalized instantaneous `body_weight` acceptance, configured range and finite-number enforcement, active supported system-definition lookup, Samsung Health source restriction, timestamp parsing, and required nonblank external IDs. Steps coverage proves `period_start` is required and must be earlier than `recorded_at`. This serializer is the live nested-entry boundary.
- Wearable-batch serializer tests prove one valid nested entry is normalized, `entries` is required and nonempty, the MVP maximum is `100`, unknown top-level or nested-entry fields are rejected, and one external source ID cannot appear twice in a batch. This serializer is the live upload request boundary.
- Canonical payload-hash tests prove entry ordering and equivalent timezone representations do not affect the digest, while changing a value or adding an entry does. They also verify the SHA-256 result is 64-character lowercase hexadecimal.
- Ingestion-service tests prove one validated new batch atomically stores its canonical hash, creates its `MetricEntry`, marks the `SyncRun` succeeded with one imported entry, and moves the connection from pending to connected with `last_synced_at`. An exact retry returns the original terminal `SyncRun` without another write. Changed content and a legacy blank-hash receipt both raise `WearableUploadConflictError` without replacing the original receipt or creating metric data.
- A cross-upload record-deduplication test proves a different `upload_id` containing the same normalized `(connection, external_source_id)` record receives a distinct successful `SyncRun` with `entries_imported=0` and `entries_skipped=1`, while only one `MetricEntry` remains.
- A mixed-batch test proves one new record plus one identical stored record produces one successful `SyncRun` with `entries_imported=1` and `entries_skipped=1`, leaving exactly the two distinct metric records stored.
- Changed-record tests prove an existing `external_source_id` with a newer `source_record_modified_at` updates the stored metric and reports `entries_updated=1`; an older version cannot overwrite newer content; and a timestamped record can upgrade one legacy null-version row. Missing/stale conflicting versions still raise `WearableRecordConflictError`, preserve the stored value, and roll back the new `SyncRun`.
- The authenticated upload API test proves version-aware updates return `201` with separate `entries_imported`, `entries_updated`, and `entries_skipped` counters. Canonical hashing includes the optional source modification timestamp while leaving legacy timestamp-free payload hashes unchanged.
- Upload API coverage proves omitting required `entries` returns `400` and creates no `SyncRun`.
- Metric-entry detail tests prove manual entries remain editable/deletable while provider/import-owned entries reject `PATCH` and `DELETE` with `409` and preserve the stored record.
- The metric-detail route test proves a Samsung Health entry renders its source label without manual Edit/Delete controls.

Current Android testing checkpoint — 2026-08-17:

- The Gradle debug build succeeds against `compileSdk 37.1`, `targetSdk 36`, and `minSdk 28`.
- Local JVM tests cover login form state, login and mobile-refresh request/response/error serialization, safe diagnostic strings, ViewModel success/failure/session-checking/session-restoration/logout state, and the HTTP repository contract. Refresh-contract tests prove the request contains exactly `refresh`, the response requires `access`, rotated `refresh` is optional, and neither token appears in diagnostic strings.
- MockWebServer and repository tests prove the repository sends `POST /api/auth/mobile/login/` with the exact Django JSON body and stores both tokens before returning success. Startup-restoration coverage proves a readable stored pair restores locally without networking or token replacement. Explicit refresh coverage proves `/api/auth/mobile/refresh/` replaces access, retains or rotates refresh correctly, skips networking without stored tokens, clears tokens after `401`, and preserves tokens across transient network failure. Logout coverage proves the client posts the stored refresh token to `/api/auth/mobile/logout/`, clears locally after successful revocation, and retains tokens after a server failure so revocation can be retried.
- `AuthenticatedApiClientTest` proves product requests use the stored access token as a Bearer credential, a `401` refreshes and retries exactly once with the replacement access token, missing/rejected sessions do not send an unauthenticated retry, and a token already replaced by another request is reused without a second rotation.
- `HealthConnectWeightSampleTest` proves the SDK-independent weight domain object preserves the record ID, kilograms, timestamp, and source package required for later upload mapping; redacts all values from diagnostics; and exposes a reader contract with an explicit time window.
- `HealthConnectStepsSampleTest` proves the SDK-independent interval object preserves the record ID, `Long` step count, period start/end, and source package; redacts all values from diagnostics; and exposes a Steps reader contract with an explicit time window.
- `AndroidHealthConnectStepsReaderTest` proves `StepsRecord` mapping, explicit read-window requests, ascending page-token traversal, permission-race translation, and retryable provider-I/O translation. The existing Android access adapter implements both Weight and Steps reader boundaries.
- `AndroidHealthConnectMetricAccessTest` proves connection permission resolution requires both `READ_WEIGHT` and `READ_STEPS`: either partial grant remains `PermissionRequired`, while the complete permission set becomes `Granted`.
- `AndroidHealthConnectWeightReaderTest` constructs real AndroidX `WeightRecord` values and proves the adapter uses the requested instant window, requests ascending records, converts mass to kilograms, maps record identity/timestamp/data origin, follows page tokens without dropping later pages, and translates revoked permission versus operational read failure into separate domain exceptions.
- Both Health Connect adapter tests prove SDK `Metadata.lastModifiedTime` reaches the device-neutral sample. Upload-contract and HTTP repository tests prove Weight and Steps serialize it as `source_record_modified_at`, while receipt tests decode `entries_updated` with a backward-compatible zero default.
- `AndroidHealthConnectBackgroundAccessTest` proves unsupported background reads remain unavailable even if a stale permission string is present, while a supported feature maps missing permission to `PermissionRequired` and an existing grant to `Granted`.
- `InitialWeightSyncPlannerTest` proves the first sync requests a deterministic 30-day window, accepts only the exact Samsung Health source package, preserves record order, splits 101 records into backend-safe batches of 100 and 1, and produces no empty upload batch when no Samsung records are available.
- `IncrementalWeightSyncPlannerTest` proves cursor lookup is scoped by connection, a stored watermark receives a 24-hour safety overlap, a missing watermark falls back to exactly 30 days, and only ordered Samsung Health records are returned in backend-safe batches.
- `IncrementalStepsSyncPlannerTest` proves the same incremental window and Samsung-origin filtering for interval-based Steps records, including chronological ordering and `100 + 1` batching at the backend limit.
- `WearableUploadRequestTest` proves one selected weight sample serializes to the exact Django snake_case batch contract, including the stable Health Connect external identity, and that request diagnostics expose neither health values, timestamps, nor provider record IDs.
- `SyncRunResponseTest` proves Android decodes every field in a terminal Django upload receipt and accepts null processing/finish timestamps for a future `received` lifecycle state.
- `HttpWearableUploadRepositoryTest` proves the shared authenticated client posts the exact normalized batch and maps `201` new work plus `200` exact retries to typed receipts, `409` to conflict, `400`/`404` to rejection, missing credentials to no-session without a request, and malformed or server responses to retryable unavailability.
- `WeightSyncCoordinatorTest` proves the coordinator accepts the planner boundary without Health Connect, one planned batch receives one generated identity, no-data creates neither an identity nor a request, 101 records upload as ordered `100 + 1` batches with distinct UUIDs, and a later failure stops processing while retaining earlier committed receipts. Permission loss and Health Connect read unavailability stop before upload and produce distinct recovery outcomes.
- `StepsSyncCoordinatorTest` proves successful Steps batches reach the Steps upload boundary and permission loss stops before UUID generation or network access.
- `AllMetricsSyncRunnerTest` proves one action runs Weight before Steps, combines both receipt sets, ignores metric-specific no-data outcomes, and preserves already committed receipts while preventing later metric runners after an interruption.
- `IncrementalWeightSyncRunnerTest` proves a completed or valid no-data run advances the caller-owned connection watermark to the timestamp captured before reading, while an interrupted run leaves the watermark unchanged for safe retry.
- `WeightSyncWorkResultMapperTest` proves completed/no-data outcomes map to WorkManager success, temporary Health Connect/server/network failures map to retry, and permission/session/domain-repair outcomes map to failure without automatic backoff loops.
- `IncrementalWeightSyncWorkerTest` uses WorkManager's instrumented worker builder on the physical phone to prove the injected worker forwards its `connection_id` to the incremental runner and returns the runner's scheduler mapping. Missing input fails without invoking the runner.
- `CurrentSyncPolicyResponseTest` and `HttpSyncPolicyRepositoryTest` prove Android reads the nested server-owned policy through the authenticated current-subscription endpoint, ignores unrelated billing fields, does not issue a request without a session, and rejects an automatic interval below WorkManager's 15-minute minimum.
- `SyncPolicyViewModelTest` proves the authenticated policy result becomes UI-safe scheduling/cooldown state without exposing HTTP details to Compose.
- `SubscriptionAwareWeightSyncRunnerTest` proves a Pro automatic policy delegates to incremental sync, while a Free/manual-only policy stops before device data is read. Temporary policy failure remains retryable through the worker result mapping.
- `WeightSyncSchedulerTest` proves each periodic request carries the caller-owned connection ID, requires a connected network, uses the server-provided valid interval, and receives the stable weight-sync tag. It also proves scheduling uses a connection-scoped unique name with `ExistingPeriodicWorkPolicy.UPDATE`; disconnect cancels only that unique name, while logout/downgrade cancellation targets all weight-sync work through the stable tag.
- `WeightSyncScheduleActionTest` proves startup session checking does not erase durable work, a confirmed logged-out session or disabled automatic policy cancels it, and only an authenticated Ready connection with granted background access and enabled policy is scheduled. The scheduled action carries the server interval; unresolved policy/connection and missing background access leave existing work unchanged.
- `WearableConnectionViewModelTest` proves background access is optional capability state on an otherwise-ready foreground connection; grant/denial updates do not create another backend registration request. Disconnect becomes visibly in-flight, returns to Idle only after success, and retains the Ready connection with a safe retry error after temporary failure.
- `HttpWearableConnectionRepositoryTest` proves Android sends the owner-scoped `DELETE` path, maps `204` and stale `404` to terminal disconnect, avoids a request without a session, and preserves server failure as retryable unavailability. `DisconnectingWearableConnectionRepositoryTest` proves confirmed server success cancels only the connection's unique work and removes only its cursor; failed server calls perform no local cleanup.
- `SharedPreferencesWeightSyncCursorStoreTest` runs against Android private storage and proves cursors survive store recreation, remain isolated by connection ID, return `null` when missing, remove wrong-typed corrupted values safely, and remove one disconnected connection's cursor without touching another.
- `InitialWeightSyncViewModelTest` proves unconfigured/cooling-down foreground sync cannot run, the latest durable device/backend successful timestamp starts the plan cooldown, availability returns at the exact boundary, completed/no-data outcomes start a new cooldown, interrupted work remains retryable, repeated taps do not overlap, and logout clears previous-user state.
- Isolated `LoginScreen` Compose tests cover session-checking, blank, submitting, safe-error, authenticated-success, logout-click, password visibility, the metric-neutral **Sync now** action, a disabled cooldown action, the optional Pro background-permission action, honest approximate automatic-sync wording, visible last-successful-sync status, and forwarding the Ready-state Disconnect action. Free/manual-only and unsupported background access hide the unusable background action.
- `MainActivityTest` clears any real stored token pair at class setup, then launches the Activity, types both credentials, observes ViewModel-backed Compose state updates, proves Sign in becomes enabled, and proves in-memory credentials survive Activity recreation without saved-state persistence. This keeps the logged-out tests deterministic on both clean CI devices and developer phones with an existing session.
- A physical-device token-store test proves access/refresh tokens round-trip through Android Keystore AES-GCM encryption, raw preferences contain neither plaintext token, and clearing removes the session.
- The focused `LoginScreenTest` suite contains 14 tests and passes on the physical `FCP-N49` phone. It includes the cooling-down action test, which proves a disabled manual-sync button cannot forward another callback, and automatic-sync presentation coverage that avoids promising exact Android execution timing.
- Android Studio preview coverage exists through `LoginScreenPreview`; preview is developer tooling rather than a behavioral test.
- Device tests require an authorized, awake, unlocked phone. A dozing device behind the lock screen was diagnosed to prevent Activity launch and produce “No compose hierarchies found”; rerunning unlocked passed both tests.
- The HTTP repository uses a local fake server in JVM tests, the production token store is verified independently on-device, and the real Activity-to-ViewModel wiring is covered on-device. Manual physical-device runs prove live Django login, encrypted JWT persistence, local startup restoration, server-revoking logout, subsequent login after restoring the temporary `adb reverse` mapping, Health Connect permission grant, a complete Samsung Health weight sync, and owner-scoped Health Connect disconnect. On 2026-08-06, the two latest Samsung-originated weight records were read through Health Connect, uploaded through `adb reverse`, stored by Django, and displayed in the React metric history. On 2026-08-17, the Android Disconnect action successfully soft-deactivated the live backend connection and returned the app to its disconnected state. Foreground periodic execution also synced successfully. A stronger process-death test proved the unique WorkManager request survived `adb am kill`, reached `READY`, retained satisfied timing/network/quota constraints, and remained registered without an app process; Honor OS nevertheless deferred actual dispatch beyond six minutes after the 15-minute minimum. A later normal-Home test remained queued roughly ten minutes beyond the minimum and produced no Django state until Longevity was reopened; reopening triggered a successful run that imported the pending 84.8 kg record. Therefore background ingestion remains unproven on this phone and exact 15-minute execution must not be asserted.
- On 2026-08-18, the version-aware provider-record slice passed `24/24` connected tests on the physical `FCP-N49` phone. A subsequent live `adb reverse` sync successfully updated the existing mutable Samsung-originated Steps record after additional walking and imported a newly added Weight record; both current values appeared through Django in the React frontend. This verifies the real Health Connect `lastModifiedTime` mapping, Android request contract, Django newer-version upsert, new-record insertion, and combined Weight-plus-Steps synchronization path.
- Physical-device tests remain a local/pre-release gate. CI should run JVM Android tests first; emulator/instrumented CI can be added when the client behavior warrants its cost.

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
- web refresh returns only `access` in JSON so frontend JavaScript cannot read the rotated refresh token
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
- `tests/test_auth_refresh_concurrency.py` uses two committed PostgreSQL connections and a controlled blacklist-check race to prove the same mobile-body or web-cookie refresh token produces exactly one `200` rotation and one `401` replay rejection
- the concurrency test exercises the real URLs, DRF views, shared rotation service, SimpleJWT blacklist tables, transaction, and row lock

Current auth foundation status:
- the backend suite now covers the explicit web/mobile auth transport split
- generic login, refresh, and logout aliases have been removed
- logout refresh-token revocation, cookie clearing, csrf bootstrap, and web csrf enforcement are covered
- current backend suite status at this checkpoint: `242 passed`

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

Removed public Celery diagnostic regression:
- `tests/test_task_ping.py` proves `/tasks/ping/` returns `404`
- `common.tasks.ping` and its HTTP view no longer exist because no product flow
  uses them
- `tests/test_celery.py` continues to protect Celery application and broker
  configuration without exposing a public queue-producing route
- `tests/test_prod_runtime.py` protects the `celerybeat-schedule*`
  Docker-context exclusion; Git's own `check-ignore` verifies repository ignore
  behavior for schedule, `.db`, `.dat`, `.bak`, `.dir`, `-shm`, and `-wal`
