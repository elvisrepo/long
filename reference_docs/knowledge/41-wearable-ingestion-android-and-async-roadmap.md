# Wearable Ingestion, Android, and Async Processing Roadmap

## Use When

- Planning or implementing `SyncRun`, wearable upload idempotency, or normalized `MetricEntry` ingestion.
- Deciding when to start the Android companion app.
- Testing Health Connect and Samsung-originated data on a physical Android phone.
- Deciding when Celery, Redis, Celery Beat, or Android WorkManager should enter the flow.

## 1. Agreed Direction

The wearable connection foundation is implemented before ingestion:

- Health Connect is the MVP connection provider.
- Samsung Health is sample provenance because Samsung-originated records reach the companion app through Health Connect.
- New and reactivated connections begin with `status=pending`.
- Disconnect marks a connection inactive and releases its plan slot without erasing the durable connection identity.
- The backend stores no raw Samsung Health or Health Connect tokens.

The next path is:

```text
SyncRun receipt
    → synchronous upload endpoint
    → first normalized MetricEntry
    → thin Android companion app
    → physical-device end-to-end test
    → broader record mappings and Android scheduling
    → Celery/Redis when processing needs to become asynchronous
```

Do not introduce Celery merely because it already exists in Docker Compose. First prove the ownership, idempotency, validation, deduplication, and persistence rules synchronously.

## 2. End-to-End Boundary

```text
Samsung Health
    ↓ writes records on device
Health Connect
    ↓ exposes user-permitted records
Android companion app
    ↓ uploads normalized batches with JWT and upload_id
Django ingestion API
    ↓ validates ownership and idempotency
MetricEntry
    ↓ existing dashboard and analytics reads
React web app
```

The Android app is the device bridge. Django cannot directly read Health Connect and Celery cannot wake an offline phone to fetch on-device records.

## 3. Recommended Implementation Order

| Phase | Work | Exit condition |
|---:|---|---|
| 1 | Add `SyncRun` and per-connection upload idempotency — implemented | Duplicate `(connection, upload_id)` cannot create a second receipt |
| 2 | Define and test `POST /api/v1/wearables/uploads/` — receipt boundary implemented | Authenticated owner can submit one valid normalized batch; unowned/inactive connections are rejected |
| 3 | Process one small batch synchronously — connection FK, external-record uniqueness, and isolated entry validation implemented | Valid samples create existing `MetricEntry` rows, duplicates are skipped, and terminal `SyncRun` counters are correct |
| 4 | Create a thin Android companion app | App can use mobile auth, request Health Connect permission, read one selected record type, and call the upload endpoint |
| 5 | Run a physical-device vertical slice | One Samsung-originated or Health Connect test record becomes a visible backend metric entry |
| 6 | Add mappings and device scheduling | Supported record types have explicit semantic mappings and Android performs retryable periodic work |
| 7 | Move expensive ingestion to Celery/Redis | API returns quickly while workers preserve the same database idempotency and terminal results |
| 8 | Add sync UI and production hardening | Users can inspect sync state; operators have rate limits, logs, metrics, and repair tools |

## 4. `SyncRun` Receipt and Status Lifecycle

`SyncRun` records an upload attempt separately from the metric data created by that attempt. It supports retries, troubleshooting, and an eventual asynchronous worker without creating a parallel metric store.

Minimal fields:

```text
id
wearable_connection_id
upload_id
status
received_at
processing_started_at
finished_at
entries_imported
entries_skipped
error_code
error_detail
metadata
```

Database idempotency boundary:

```text
UNIQUE(wearable_connection_id, upload_id)
```

The receipt endpoint uses this constraint through `get_or_create()`: the first
submission returns `201`, while a retry returns the unchanged existing receipt
with `200`. The scope includes the connection so different connections may use
the same client-generated upload UUID independently.

Agreed status lifecycle:

```text
received
    ↓
processing
    ├── succeeded
    ├── partial
    └── failed
```

Meanings:

- `received`: Django durably accepted the batch identity but has not begun normalization.
- `processing`: synchronous code or a Celery worker owns the processing attempt.
- `succeeded`: every accepted sample completed successfully.
- `partial`: at least one sample imported and at least one sample was rejected or skipped for a non-idempotent reason.
- `failed`: the batch produced no successful import because processing failed.

`received` is intentionally broker-neutral. Synchronous code can advance immediately to `processing`; an asynchronous implementation can leave the receipt at `received` until a worker claims it.

`received_at` is set when the receipt is created. `processing_started_at` and `finished_at` remain null until their corresponding transitions occur, avoiding an ambiguous generic `started_at` timestamp.

## 5. Initial Upload Contract

Implemented receipt endpoint; normalized `entries` remain planned:

```http
POST /api/v1/wearables/uploads/
Authorization: Bearer <mobile-access-token>
```

Initial normalized payload shape:

```json
{
  "connection_id": "7df7e4ab-7e6f-4558-b9be-17c824fbf54e",
  "upload_id": "9ea2c91d-63f-40eb-a6bb-7fbd90c12a34",
  "entries": [
    {
      "metric_definition": "body_weight",
      "value": 78.4,
      "recorded_at": "2026-07-15T08:00:00Z",
      "source": "samsung_health",
      "external_source_id": "health-connect-record-123"
    }
  ]
}
```

The backend must verify:

- JWT authentication uses the mobile auth flow.
- `connection_id` belongs to the authenticated user and is active.
- `upload_id` is idempotent within the connection.
- The metric definition is a supported active system definition.
- Value and timestamp satisfy the metric definition and API bounds.
- Source provenance is allowed and cannot be used to spoof another connection.
- PostgreSQL already prevents inserting the same non-null `external_source_id` twice for one source connection. The ingestion service must update corrected records through that identity.
- Batch size and payload size remain bounded.

The isolated first-entry validator currently supports only active system
`body_weight` records with Samsung Health provenance. It uses the configured
metric range (`20–400 kg`), requires a parseable timestamp and nonblank external
ID, and remains disconnected from the receipt-only endpoint until persistence
and payload-reuse protection are ready.

Until that integration is complete, the receipt endpoint accepts only
`connection_id` and `upload_id`. It rejects `entries` and every other undeclared
field with `400`, preventing a successful response from masking discarded
health data.

The isolated future batch serializer requires `connection_id`, `upload_id`, and
`1–100` entries. The `100`-entry MVP ceiling keeps synchronous work bounded
while covering a substantial low-frequency body-weight backfill. Unknown fields
are rejected at both the batch and entry levels.

The first endpoint should process a deliberately small batch synchronously and return terminal counts. A duplicate retry should return the existing outcome or another explicitly documented idempotent response, not repeat `MetricEntry` inserts.

## 6. When to Create the Android App

Start the thin Android project after the upload request/response contract exists and one backend happy-path test passes. Do not wait for every metric mapping, Celery, frontend sync UI, or production deployment.

First Android scope:

1. Sign in through `POST /api/auth/mobile/login/`.
2. Store mobile credentials using Android-appropriate secure storage.
3. Check Health Connect availability.
4. Request permission for one deliberately selected record type.
5. Read a small bounded time range.
6. Normalize records into the backend upload contract.
7. Generate a stable upload UUID for the batch.
8. POST the batch and display its result.

Do not map a convenient Health Connect type to the wrong domain metric. For example, a generic heart-rate sample is not automatically a resting-heart-rate measurement. Choose the first record type only after confirming its semantics match an existing `MetricDefinition`, or add a correct system definition deliberately.

## 7. Physical Phone Testing Without Public Deployment

A public Play Store deployment is not required for the first real Health Connect test.

Recommended local path:

1. Enable developer options and USB debugging on the Android phone.
2. Connect the phone to the development machine.
3. Run the debug build directly from Android Studio, or build a debug APK and install it with `adb install`.
4. Use `adb reverse tcp:8000 tcp:8000` while Django is exposed on local port `8000` so the phone can call the development API through `http://127.0.0.1:8000`.
5. Allow cleartext HTTP only in the debug Android configuration; production builds must use HTTPS.
6. Grant the requested Health Connect permissions on the phone.
7. Read a real or test Health Connect record and upload it to Django.
8. Verify the resulting `SyncRun`, `MetricEntry`, connection state, and frontend display.

Alternative local networking is to use the development machine's LAN address while the phone is on the same network, with Django host/CORS configuration scoped appropriately. USB plus `adb reverse` is usually simpler and avoids exposing the development server to the LAN.

Distribution progression:

```text
Android Studio / adb-installed debug build
    ↓
signed internal test build or private testing track
    ↓
production store release after privacy, permissions, security, and policy review
```

Health Connect and app-store policy requirements must be checked against current official Android documentation before public distribution; they are not a blocker for an initial locally installed debug build.

## 8. Android Scheduling Versus Celery Scheduling

Android and backend schedulers have different responsibilities.

Android WorkManager:

- Runs on the phone.
- Reads Health Connect after the user grants permission.
- Handles device/network availability and retryable uploads.
- Eventually uses the plan's `sync_interval_minutes` as an input to the supported device scheduling policy.

Celery:

- Runs behind Django.
- Processes batches only after Android uploads them.
- Performs expensive normalization, deduplication, bulk inserts, cache invalidation, replay, backfill, or repair work.
- Cannot read Health Connect directly.

Celery Beat:

- Schedules server-side maintenance, reconciliation, stale-run repair, cleanup, or analytics jobs.
- Must not be modeled as a scheduler that polls an offline Android phone.

## 9. When Celery and Redis Enter

Keep ingestion synchronous until correctness is proven. Introduce asynchronous processing when at least one of these is true:

- Batches are large enough to make HTTP latency unreliable.
- Processing needs retries independent of the phone request.
- Normalization performs substantial CPU or database work.
- Backfills, replays, or repair workflows exist.
- Cache invalidation or analytics work should run outside the request.

Asynchronous flow:

```text
Android POST
    ↓
Django validates JWT, ownership, active connection, payload bounds, and upload_id
    ↓
Django creates or returns SyncRun(received)
    ↓
Django publishes a task and returns 202
    ↓
Redis transports the temporary task message
    ↓
Celery worker claims SyncRun and marks processing
    ↓
Worker writes MetricEntry rows and terminal SyncRun state
```

Responsibilities:

- PostgreSQL is the source of truth for upload identity, processing state, counters, errors, and metric data.
- Redis is a temporary Celery broker, not the upload-completion ledger.
- The Celery worker owns asynchronous processing, not authorization of arbitrary connection IDs.
- Database constraints remain the final duplicate protection even if a task is delivered more than once.

## 10. Connection-State Effects

Connection lifecycle and upload lifecycle are separate:

```text
Register/reactivate connection
    → WearableConnection(status=pending, is_active=true)

Successful first ingestion
    → WearableConnection(status=connected)
    → last_synced_at updated
    → last_error cleared

Failed ingestion
    → WearableConnection(status=error)
    → last_error set to a safe operational message

User disconnects
    → WearableConnection(is_active=false)
    → durable identity and sync history preserved
    → plan slot released
```

The backend must never mark a connection `connected` merely because registration succeeded or a task was enqueued.

## 11. Immediate TDD Step

Start with the model boundary only:

```python
def test_sync_run_rejects_duplicate_upload_id_for_same_connection():
    ...
```

Then add, one behavior at a time:

- the same `upload_id` may be used by a different connection without collision;
- new runs default to `received` with zero counters and null processing/finish timestamps;
- status values and terminal timestamps are modeled explicitly;
- the connection relationship preserves upload history across soft disconnect;
- account deletion still removes user-owned wearable data according to the eventual GDPR deletion contract.

Do not add the upload endpoint, `MetricEntry` writes, or Celery in the first model test.
