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
