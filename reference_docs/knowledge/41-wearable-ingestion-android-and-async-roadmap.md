# Wearable Ingestion, Android, and Async Processing Roadmap

## Use When

- Planning or implementing `SyncRun`, wearable upload idempotency, or normalized `MetricEntry` ingestion.
- Deciding when to start the Android companion app.
- Testing Health Connect and Samsung-originated data on a physical Android phone.
- Deciding when Celery, Redis, Celery Beat, or Android WorkManager should enter the flow.

The maintained visual companion for this roadmap is
`reference_docs/knowledge/diagrams/wearable-ingestion-data-flow.md`.

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
    → thin Android companion app — in progress
    → Android mobile authentication
    → Health Connect weight permission/read/upload
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

### 2.1 Local and Hosted Android Connectivity

Android and React are peer clients of Django. The companion app does not call
the React frontend, connect to PostgreSQL, or contain AWS, database, Django, or
Stripe server secrets.

```text
Local debug:
Android → http://127.0.0.1:8000/ → adb reverse → local Django

Hosted staging:
Android staging build
    → https://api-staging.<domain>/
    → public DNS
    → HTTPS ALB
    → Django container on EC2
    → Timescale Cloud

Production:
Android release build
    → https://api.<domain>/
    → the production ALB, EC2 application, and database
```

The hosted app uses ordinary Wi-Fi or mobile data and no USB tunnel. Its OkHttp
repositories keep the same API contracts: mobile login/refresh/logout,
current-subscription policy, wearable connection lifecycle, and normalized
Weight/Steps upload. The access JWT remains the request credential; Android
Keystore-backed storage remains the durable device boundary. The public API URL
is non-secret build configuration.

Planned Gradle build identities and API environments:

```text
debug    com.viridiandome.longevity.debug    localhost API
staging  com.viridiandome.longevity.staging  public staging API
release  com.viridiandome.longevity          public production API
```

Separate application IDs allow builds to coexist and isolate Keystore data,
sessions, app storage, and Health Connect permission grants. The first staging
APK may be installed directly for a smoke test; Play Internal Testing is the
preferred repeatable private distribution path before a public Play release.

Native OkHttp is not subject to browser CORS enforcement. It is still subject
to TLS, JWT validation, throttling, caller ownership, subscription entitlement,
idempotency, and payload-validation rules enforced by the public Django API.

## 3. Recommended Implementation Order

| Phase | Work | Exit condition |
|---:|---|---|
| 1 | Add `SyncRun` and per-connection upload idempotency — implemented | Duplicate `(connection, upload_id)` cannot create a second receipt |
| 2 | Define and test `POST /api/v1/wearables/uploads/` — normalized contract implemented | Authenticated owner can submit one valid normalized batch; unowned/inactive connections are rejected |
| 3 | Process one small batch synchronously — fully wired | New batches, exact retries, upload conflicts, record skips, mixed counters, and record conflicts are covered through the live endpoint/service boundary |
| 4 | Create a thin Android companion app — initial weight slice implemented | App can use mobile auth, request Health Connect permission, read weight records, and call the upload endpoint |
| 5 | Run a physical-device vertical slice — completed 2026-08-06 | Two Samsung-originated records became visible React metric-history entries through the live local stack |
| 6 | Add mappings and device scheduling — periodic weight scheduling implemented | Supported record types have explicit semantic mappings and Android performs retryable periodic work |
| 7 | Move expensive ingestion to Celery/Redis | API returns quickly while workers preserve the same database idempotency and terminal results |
| 8 | Add sync UI and production hardening | Users can inspect sync state; operators have rate limits, logs, metrics, and repair tools |

### Current Android checkpoint — 2026-08-17

Implemented:

- `android/` is a Kotlin Android application using Jetpack Compose and the Gradle wrapper.
- Application ID and namespace are `com.viridiandome.longevity`.
- `minSdk=28` matches the physical Health Connect availability floor; the current project compiles against Android API `37.1` while targeting API `36`.
- `LoginFormState` owns immutable credentials plus checking, submission, authentication, and logout state; it redacts credentials from its diagnostic string and derives whether submission is enabled.
- `LoginScreen` is a stateless Compose component with a dedicated session-checking screen, controlled email/password fields, masked-by-default password display, a temporary Show/Hide password control, loading and safe-error feedback, state-controlled Sign in and Logout buttons, authenticated-success content, and Android Studio previews.
- `MainActivity` obtains `LoginViewModel` from a factory, collects its `StateFlow` with lifecycle awareness, and sends UI events back through one-way Compose callbacks. The ViewModel retains in-memory credentials across Activity recreation without persisting the password to saved state.
- `LoginViewModel` and the `AuthRepository` interface define a testable presentation/authentication boundary; ViewModel tests cover credential changes, successful and failed submission, startup restoration, explicit session-checking state, and logout.
- Kotlin serialization models and tests cover the Django mobile-login request, token response, and documented validation/error response shapes without exposing credentials or JWTs through diagnostic strings.
- Kotlin serialization models cover the mobile-refresh request and both valid response shapes: required replacement `access` with an optional rotated `refresh`.
- `HttpAuthRepository` uses OkHttp coroutines to POST the exact Django mobile-login contract, decode safe error responses, translate transport/malformed-response failures, and save both JWTs through the injected `AuthTokenStore` boundary before returning success.
- MockWebServer tests cover successful token storage, invalid credentials, unavailable Django, and malformed successful responses without requiring the physical phone or live backend.
- `AndroidKeystoreAuthTokenStore` encrypts each JWT with AES-256-GCM and a fresh IV, binds each ciphertext to its preference key as authenticated data, keeps the non-exportable key in Android Keystore, and stores only encoded IV+ciphertext payloads in private preferences.
- The production token preference file is excluded from cloud backup and device transfer. A physical-device test proves encrypted-at-rest round-trip and clearing behavior.
- On app startup, `LoginViewModel` asks `AuthRepository.restoreSession()` once. The UI remains in session-checking state while the repository checks for a readable Keystore-backed local pair; startup does not rotate refresh credentials. Product requests reuse the stored access token, and the separate `SessionRefresher` performs rotation only after an access-token `401`.
- Android logout posts the stored refresh token to Django for SimpleJWT blacklisting before deleting the encrypted local pair. Server/network failure retains the authenticated state and credentials for an honest retry.
- `AuthenticatedApiClient` is the reusable product-API boundary: it reads encrypted access credentials, adds the Bearer header, buffers/closes responses, refreshes and retries once after `401`, and returns `NoSession` or `Unavailable` without leaking response bodies through diagnostics. A mutex plus a storage recheck prevents concurrent expired requests from rotating the same refresh token twice.
- `LongevityApplication` is the minimal application-level dependency container: it shares one OkHttp client, one `HttpAuthRepository`, one `AuthenticatedApiClient`, the connection/upload/subscription-policy repositories, one dual-purpose Health Connect access/reader adapter, the durable incremental runner graph, its subscription-aware background wrapper, and the Android-Keystore token store without introducing a dependency-injection framework prematurely.
- The wearable repository can list caller-owned connections and explicitly register/reactivate Health Connect through the authenticated API client. Its GET-then-POST orchestration reuses an existing row, creates one only when absent, and keeps no-session, domain-rejection, and temporary-unavailability outcomes distinct.
- `WearableConnectionViewModel` starts without network side effects, resolves Health Connect only after the authenticated user explicitly chooses Connect, prevents overlapping retries, and cancels and resets its state on logout so one user's connection metadata cannot leak into a later session.
- The authenticated Compose screen renders idle, loading, pending/connected, rejected, expired-session, and retryable-unavailable connection states. Rendering or signing in alone does not consume a wearable plan slot; the Connect action is the backend-registration consent boundary.
- Subscription plans expose explicit device-sync policy. Free owns one Health Connect slot, disables unattended sync, and uses a 30-minute manual cadence; Pro enables a 15-minute automatic cadence. The web Settings screen renders those distinctions. Android now consumes the authenticated current-subscription response, cancels stale work after a downgrade, rechecks entitlement inside every worker run, and gates foreground taps with the durable per-connection successful-sync cursor plus Django's `last_synced_at`.
- The Android app uses stable `androidx.health.connect:connect-client:1.1.0`, checks `HealthConnectClient.getSdkStatus()`, and requires both `READ_WEIGHT` and `READ_STEPS` before touching the backend connection. A partial grant remains permission-required and the official contract requests the complete supported-metric permission set. It separately checks `FEATURE_READ_HEALTH_DATA_IN_BACKGROUND` and its grant after a connection is ready. Unsupported background access never disables manual sync.
- `HealthConnectWeightSample` is the SDK-independent domain representation for one future `WeightRecord`: stable record ID, kilograms, recorded timestamp, and source package. Its diagnostic string redacts all health values. `HealthConnectWeightReader` defines an explicit start/end read window so later cursor and retry behavior does not depend on hidden adapter-selected time ranges.
- `HealthConnectStepsSample` is the SDK-independent representation of one interval-based `StepsRecord`: stable record ID, `Long` count, period start/end, and source package. Its diagnostic string redacts every value, and `HealthConnectStepsReader` defines the same explicit read-window boundary without importing Health Connect SDK types into the sync domain.
- `AndroidHealthConnectAccess` implements the reader through `HealthConnectClient.readRecords()`. The adapter queries the explicit window in ascending order, follows every Health Connect page token, converts mass to kilograms, and maps the SDK record ID, timestamp, and `dataOrigin.packageName` without exposing SDK types to higher layers. A permission race becomes `WeightReadPermissionRequiredException`; documented I/O, IPC, and unavailable-service failures become retryable `WeightReadUnavailableException`.
- `WeightSyncBatchPlanner` is the shared policy boundary that supplies ordered, backend-sized weight batches. `InitialWeightSyncPlanner` implements it with an injected UTC clock: it requests the previous 30 days, keeps only records whose Health Connect data origin is Samsung Health (`com.sec.android.app.shealth`), preserves chronological order, and splits them into batches of at most 100 entries to match the live backend request limit. No Samsung records produces no upload batches.
- Android upload request models serialize the live Django contract exactly: caller-owned connection UUID, retry-stable upload UUID, and normalized `body_weight` entries with kilograms, ISO-8601 timestamps, Samsung Health provenance, and `health_connect:WeightRecord:<record-id>` external identities. Their diagnostic strings redact health values and record identifiers.
- Django seeds `steps` as a system activity metric (`0` through `200000` steps per entry) and the shared upload endpoint persists normalized Steps intervals. `MetricEntry.period_start` stores the interval beginning while `recorded_at` stores its end; instantaneous Weight leaves `period_start` null. Android maps every ascending Health Connect `StepsRecord` page through `AndroidHealthConnectAccess`, filters Samsung provenance, and serializes `steps` entries with `period_start`, interval-end `recorded_at`, and stable `health_connect:StepsRecord:<record-id>` identities.
- `SyncRunResponse` decodes Django's read-only upload receipt, including imported/updated/skipped counters and nullable processing/finish timestamps so the Android boundary supports both today's synchronous terminal result and the planned asynchronous lifecycle.
- `HttpWearableUploadRepository` maps planned samples into the normalized request and posts it through the shared authenticated client. New `201` and exact-retry `200` receipts are success; `409` content conflicts, `400`/`404` rejections, missing sessions, and retryable/malformed failures remain distinct. Its public receipt uses typed `Instant` values and does not expose transport DTOs.
- `WeightSyncCoordinator` and `StepsSyncCoordinator` each connect their metric-specific planner to the shared upload repository through the existing `WeightSyncRunner`/`WeightSyncResult` boundary. Each creates one UUID per ordered batch, avoids empty requests, and stops on its first failure while preserving earlier committed receipts. `AllMetricsSyncRunner` runs Weight and then Steps, combines their receipts, skips metric-specific no-data results, and stops before later metrics on an interruption. The type names remain Weight-specific legacy names, but the application-level behavior is multi-metric.
- `IncrementalWeightSyncPlanner` and `WeightSyncCursorStore` now define the background read-window policy at the domain boundary. Cursor lookup is scoped by caller-owned connection ID; an existing watermark receives a 24-hour overlap, a missing watermark safely falls back to 30 days, and stable external record IDs make overlap duplicates harmless at ingestion.
- `IncrementalWeightSyncRunner` wraps the complete `AllMetricsSyncRunner` and captures the conservative shared watermark before either metric is read. It persists that watermark only after every supported metric completes or has no data, never after an interruption, so a failed later metric remains inside the next retry window.
- `SharedPreferencesWeightSyncCursorStore` persists epoch-millisecond watermarks in private application storage with one key per connection. Writes and connection-scoped removal use durable `commit()` on the I/O dispatcher; missing values return `null`, and wrong-typed corrupted values are removed before the planner falls back safely. Cursor preferences are excluded from cloud backup and device transfer so an old device watermark cannot skip Health Connect history on a different phone.
- Stable AndroidX WorkManager `2.11.2` and its `work-testing` artifact are configured. `WeightSyncResult.toWorkResult()` is the tested domain-to-scheduler boundary: `Completed`/`NoData` become success; `ReadUnavailable`/`Unavailable` become retry; permission, conflict, rejection, and missing-session outcomes become failure.
- `IncrementalWeightSyncWorker` validates its input connection ID, calls the injected application-scoped all-metric incremental runner, and returns that mapping. `LongevityWorkerFactory` supplies the runner, and `LongevityApplication` implements `Configuration.Provider` so WorkManager uses that factory. The worker and scheduler retain their Weight-specific class names as naming debt; their live behavior now synchronizes Weight and Steps. The manifest removes WorkManager's default AndroidX Startup initializer while retaining Startup for other libraries.
- `WorkManagerWeightSyncScheduler` now enqueues one connection-scoped unique periodic request using `ExistingPeriodicWorkPolicy.UPDATE`, a connected-network constraint, WorkManager's 15-minute minimum interval, and a stable tag. `MainActivity` schedules only after authentication, a Ready caller-owned connection, and granted background access. It deliberately does nothing during startup session checking, cancels one unique request after connection disconnect, and cancels all tagged weight work only after logout or a manual-only policy is confirmed.
- Android's Ready state exposes **Disconnect Health Connect**. `HttpWearableConnectionRepository` calls the existing owner-scoped Django `DELETE`; `DisconnectingWearableConnectionRepository` performs local cleanup only after terminal server confirmation. Temporary failure preserves the Ready state and its work/cursor for honest retry; success returns to Idle, cancels only the connection's unique work, and removes only its cursor.
- `InitialWeightSyncViewModel` runs only after the user chooses **Sync now**, prevents overlapping work, aggregates Weight and Steps receipts into imported/updated/skipped counts, exposes recovery outcomes without health records or receipt IDs, and cancels/clears state on logout. The ViewModel retains its legacy name; the authenticated Compose screen and user-facing status text are metric-neutral.
- The manifest declares `android.permission.health.READ_WEIGHT`, `android.permission.health.READ_STEPS`, and `android.permission.health.READ_HEALTH_DATA_IN_BACKGROUND`, the pre-Android-14 Health Connect package query, and the required pre/post-Android-14 permission-rationale intents. The rationale explains authorized Weight/Steps foreground and optional background reads; the app does not write or delete Health Connect data.
- `MainActivity` launches the ordinary Health Connect permission contract only after Connect. Once a connection is ready, a separate **Allow background sync** action appears only when the feature is supported and the additional grant is missing. Grant/denial updates local capability state without repeating backend registration.
- The currently implemented build targets local Django at `http://127.0.0.1:8000/` through `adb reverse`. Separate debug/staging/release application IDs and public HTTPS base URLs are planned but not yet implemented; cloud deployment alone will not redirect the installed client.
- The main manifest permits network access but explicitly rejects cleartext traffic; a debug-only manifest overlay permits local HTTP while release remains HTTPS-only.
- `adb reverse tcp:8000 tcp:8000` lets the connected phone reach local Django at `http://127.0.0.1:8000`; the mapping is temporary and must be recreated after relevant ADB/device reconnects.
- Android Studio/Gradle can build the debug APK, and `adb` can install/run the app and instrumented tests on the physical `FCP-N49` phone.
- JVM tests cover login form, serialization, safe errors, repository refresh/logout behavior, and ViewModel behavior. Compose tests cover checking, blank, submitting, failed, authenticated-success, logout, and password-visibility states plus real-Activity credential entry and Activity-recreation retention on the physical phone.

Not implemented yet:

- Reliable background/closed-process periodic execution, additional metric mappings, Celery-backed asynchronous ingestion, and production distribution remain later phases. Foreground periodic sync and live end-to-end disconnect were manually validated on 2026-08-17. Process-death and normal-Home tests confirmed the WorkManager request survives, but Honor OS delayed execution beyond the requested 15-minute minimum. The normal-Home upload occurred only after Longevity was reopened, so no background upload is claimed.

Manually validated on the physical phone:

- login reaches local Django through `adb reverse`, stores the JWT pair, and renders authenticated content
- reinstalling the current debug build preserves the encrypted pair and local startup restoration reuses it without an immediate refresh request
- the earlier Health Connect system permission flow physically granted Longevity `READ_WEIGHT` plus supported background-read access; the updated permission resolver now requires both `READ_WEIGHT` and `READ_STEPS`, with renewed physical verification pending after the phone disconnected from ADB
- the earlier explicit sync action read the two latest Samsung-originated weight records through Health Connect, uploaded them through `adb reverse`, created the corresponding Django sync/metric state, and made both values visible in the React metric history; automated tests now prove the same application action also plans and uploads Steps
- Logout calls Django revocation, clears the local session, and returns to the login form
- Disconnect Health Connect calls Django's owner-scoped soft-delete boundary, releases the live plan slot, cancels the connection-scoped device work, clears its cursor, and returns the UI to Not connected
- reconnecting USB/ADB may remove the reverse mapping; restoring `adb reverse tcp:8000 tcp:8000` restores local API access without a rebuild
- WorkManager's 15-minute periodic interval is a minimum, not a deadline. Force-stopping an Android app prevents all of its scheduled work until the user launches it again; ordinary backgrounding or process death preserves work, but Android and OEM battery policy may delay execution.

## 4. `SyncRun` Receipt and Status Lifecycle

`SyncRun` records an upload attempt separately from the metric data created by that attempt. It supports retries, troubleshooting, and an eventual asynchronous worker without creating a parallel metric store.

Minimal fields:

```text
id
wearable_connection_id
upload_id
payload_hash
status
received_at
processing_started_at
finished_at
entries_imported
entries_updated
entries_skipped
error_code
error_detail
metadata
```

Database idempotency boundary:

```text
UNIQUE(wearable_connection_id, upload_id)
```

The ingestion service checks this identity while holding the connection lock.
The first normalized submission returns `201`, while an exact retry returns the
unchanged terminal result with `200`. The scope includes the connection so
different connections may use the same client-generated upload UUID
independently.

`payload_hash` is a 64-character internal field. Historical receipt-only rows
may have an empty string; current normalized uploads always store a
server-computed digest. A pure server-side helper
computes a schema-versioned SHA-256 fingerprint from validated entries. It sorts
by required external record ID and normalizes timestamps to UTC, so entry order
and equivalent timezone representations do not change the hash while changed,
added, or removed records do.

The isolated `process_wearable_upload()` service locks one connection and
atomically stores the hash, normalized entries, terminal successful receipt,
and connected/last-synced state. An exact retry with the same connection,
upload ID, and canonical hash returns that original receipt before repeating
any writes. Reusing that identity with changed content or a legacy unknown
payload raises `WearableUploadConflictError`.

A new upload containing an external record whose normalized health content
matches the stored record skips the insert and increments `entries_skipped`.
If the provider timestamp is newer, its version metadata is refreshed even
when content is unchanged. A mixed batch with one new and one identical stored
record reports `entries_imported=1` and `entries_skipped=1`.

Changed content under the same external ID is accepted only when
`source_record_modified_at` is newer than the stored provider version; the
existing `MetricEntry` is updated and `entries_updated` increments. A legacy
row with a null source version may be upgraded once by a timestamped record.
Missing, equal, or older timestamps cannot authorize changed content and raise
`WearableRecordConflictError`, rolling back the new `SyncRun`. This rule is
provider-generic and is required because evolving Steps intervals can retain
their Health Connect ID while their count changes.

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

Implemented synchronous normalized upload contract:

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
      "external_source_id": "health-connect-record-123",
      "source_record_modified_at": "2026-07-15T08:01:00Z"
    },
    {
      "metric_definition": "steps",
      "value": 420,
      "period_start": "2026-07-15T07:45:00Z",
      "recorded_at": "2026-07-15T08:00:00Z",
      "source": "samsung_health",
      "external_source_id": "health_connect:StepsRecord:record-123",
      "source_record_modified_at": "2026-07-15T08:02:00Z"
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
- Numeric values are finite; `NaN` and infinities cannot enter persistence or canonical hashing.
- Source provenance is allowed and cannot be used to spoof another connection.
- PostgreSQL prevents inserting the same non-null `external_source_id` twice for one source connection. The service skips identical records, applies changed content only from a newer provider modification timestamp, and rejects stale or unversioned conflicting content with `409`.
- Batch size and payload size remain bounded.

The live nested-entry validator supports active system `body_weight` and
`steps` records with Samsung Health provenance. It applies each definition's
configured range, rejects non-finite numbers, and requires a parseable
`recorded_at` plus a nonblank external ID. Steps also requires a parseable
`period_start` earlier than `recorded_at`; instantaneous Weight rejects a
supplied interval start.

The live batch serializer requires `connection_id`, `upload_id`, and
`1–100` entries. The `100`-entry MVP ceiling keeps synchronous work bounded
while covering a substantial low-frequency body-weight backfill. Unknown fields
are rejected at both the batch and entry levels, and one external source ID may
appear only once per batch.

The first endpoint should process a deliberately small batch synchronously and return terminal counts. A duplicate retry should return the existing outcome or another explicitly documented idempotent response, not repeat `MetricEntry` inserts.

## 6. When to Create the Android App

Start the thin Android project after the upload request/response contract exists and one backend happy-path test passes. Do not wait for every metric mapping, Celery, frontend sync UI, or production deployment.

First Android scope:

1. Sign in through `POST /api/auth/mobile/login/`.
2. Store returned access/refresh tokens using Android-appropriate secure storage; never persist the password.
3. Check Health Connect availability.
4. Request permission for one deliberately selected record type.
5. Read a small bounded time range.
6. Normalize records into the backend upload contract.
7. Generate a stable upload UUID for the batch.
8. POST the batch and display its result.

Implementation sequence from the current UI checkpoint:

1. Prevent accidental password disclosure through state logging.
2. Define/test the mobile-login request, response, and failure contract.
3. Add a ViewModel and repository boundary; do not place HTTP calls directly in `MainActivity`. — implemented
4. Add debug-only network configuration and use `adb reverse tcp:8000 tcp:8000`. — implemented
5. Call Django mobile login and securely store the returned tokens. — implemented and manually verified on the physical phone
6. Fetch or register the caller-owned Health Connect `WearableConnection`.
7. Add Health Connect SDK availability and weight-read permission.
8. Read a bounded `WeightRecord` range, preserve stable external IDs, filter/label provenance correctly, and upload through the existing endpoint.

Do not map a convenient Health Connect type to the wrong domain metric. For example, a generic heart-rate sample is not automatically a resting-heart-rate measurement. Choose the first record type only after confirming its semantics match an existing `MetricDefinition`, or add a correct system definition deliberately.

## 7. Physical Phone Testing Without Public Deployment

A public Play Store deployment is not required for the first real Health Connect test.

Recommended local path:

1. Enable developer options and USB debugging on the Android phone — completed locally.
2. Connect and authorize the phone with the development machine — completed locally for `FCP-N49`.
3. Run the debug build and Compose instrumented tests through Android Studio/Gradle and `adb` — completed for the login UI.
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
- Fetches `automatic_sync_enabled` and `sync_interval_minutes` from the authenticated current-subscription endpoint. Automatic work is scheduled only when enabled; otherwise the same interval controls when the manual action becomes eligible again. This policy consumption and execution-time recheck are implemented.

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
