## 6. Testing

## Use When
- Load this when you need the testing pyramid, tool choices, CI expectations, or coverage targets.

## Source
- Derived from `reference_docs/knowledge/planning.md` section 6.

| Type | Tool | What | When |
|---|---|---|---|
| **Unit** | pytest + pytest-django | Models, services, serializers, validators | Every PR (CI) |
| **Integration** | pytest + DRF `APIClient` | Full API endpoint flows (auth → create metric → query analytics) | Every PR (CI) |
| **E2E** | Playwright | Login → log metric → see on dashboard → export data | Pre-release |
| **Performance** | Locust | Load test: 100 concurrent users, metrics CRUD + analytics queries | Pre-R2 launch |
| **Security** | pip-audit + bandit | Dependency vulnerabilities + code security patterns | Every PR (CI) |

**Coverage target**: 80%+ via `pytest-cov`, enforced in CI.

### Task-Triggering Endpoint Tests

When testing Django endpoints that enqueue Celery tasks:
- mock `.delay()` at the import path used by the view
- do not depend on a live Redis broker or running Celery worker
- verify HTTP response shape and that `.delay()` was called correctly

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

Those runtime concerns should be verified separately through manual Docker checks or broader integration tests.
