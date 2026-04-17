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
- login route tests now prove route-level orchestration behavior:
  - route calls `loginWeb(...)`
  - route surfaces async auth errors
  - route disables re-submit while pending
  - route stores the returned access token before continuing the success path
  - route redirects after successful login
- settings route tests now prove the first protected-route behavior:
  - unauthenticated/error state redirects to `/login`
  - authenticated state renders settings content and the current user email
- dashboard route tests now prove the protected dashboard behavior:
  - unauthenticated/error state redirects to `/login`
  - authenticated state renders the dashboard at `/`
- protected-route coverage now exercises the shared `RequireAuth` path indirectly through both `/` and `/settings`

What the current frontend tests are not proving:
- no real backend requests are being made yet
- no real frontend-to-backend auth request is being executed yet; the network boundary is still mocked
- no app-wide authenticated user bootstrap lifecycle is covered yet
- no dedicated unit/component test exists yet for `RequireAuth` itself; coverage is currently indirect through route tests
- no browser-level end-to-end flow is covered yet

Practical test-level guidance for the current frontend slice:
- use route tests for screen presence and router wiring
- use focused component tests for local form behavior
- use small API helper contract tests for `fetch`-based backend wrappers
- do not jump to mocked API or real backend integration until the local screen and form contract are stable
- once auth submission behavior is ready, add mocked-network integration tests with `MSW`
- once the full auth flow is stable, add Playwright end-to-end coverage for the real user journey

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
