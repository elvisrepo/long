# Android Sync Coordination, WorkManager, and Celery

## When to use this document

Use this document when:

- changing the Android weight-sync pipeline;
- deciding whether logic belongs in a planner, coordinator, ViewModel, or worker;
- separating initial backfill from incremental background synchronization;
- deciding when Android WorkManager, Django, Redis, Celery, or Celery Beat should run work.

This document describes the implemented Android flow as of 2026-08-08 and the agreed next architecture. The current Android slice supports weight records only.

## 1. Implemented Android sync components

The current slice handles only weight records. Both foreground taps and background work now use the incremental policy; a connection without a cursor still receives the bounded 30-day fallback.

### `WeightSyncBatchPlanner`

Path: `android/app/src/main/java/com/viridiandome/longevity/wearables/sync/WeightSyncBatchPlanner.kt`

This small interface supplies ordered, backend-sized batches for one chosen sync window. It separates *which records belong in this run* from the shared read-and-upload orchestration.

### `InitialWeightSyncPlanner` and `IncrementalWeightSyncPlanner`

Path: `android/app/src/main/java/com/viridiandome/longevity/wearables/sync/InitialWeightSyncPlanner.kt`

`InitialWeightSyncPlanner` remains a tested reference for the original bounded backfill. The live application graph uses `IncrementalWeightSyncPlanner`, which:

1. reads the per-connection successful cursor;
2. uses a 24-hour overlap when the cursor exists, or the previous 30 days when absent;
3. reads through `HealthConnectWeightReader`;
4. keeps only Samsung Health records from `com.sec.android.app.shealth`;
5. preserves chronological order and splits at 100 entries.

The planner does not perform HTTP requests, generate upload IDs, or update Compose state.

### `WeightSyncCoordinator`

Path: `android/app/src/main/java/com/viridiandome/longevity/wearables/sync/WeightSyncCoordinator.kt`

The coordinator orchestrates one complete read-and-upload attempt:

```text
Ask planner for batches
    ↓
Generate one upload_id per batch
    ↓
Upload each batch sequentially
    ↓
Collect successful Django receipts
    ↓
Stop on the first failure
    ↓
Return Completed, NoData, or Interrupted
```

It translates lower-level failures into domain outcomes:

- Health Connect read permission is missing;
- Health Connect is temporarily unavailable;
- the backend reports an upload conflict;
- the backend rejects the request;
- the mobile session is missing or expired;
- the network or backend is temporarily unavailable.

The coordinator does not know about Compose controls or user-facing text.

### `WeightSyncRunner`

`WeightSyncRunner` is the small interface implemented by the coordinator:

```kotlin
suspend fun sync(connectionId: String): WeightSyncResult
```

The ViewModel depends on this interface instead of the concrete coordinator. Tests can supply a fake runner without using Health Connect, Django, or a physical phone. The implemented WorkManager worker depends on a subscription-aware runner wrapper without depending on the UI ViewModel.

### `InitialWeightSyncViewModel`

Path: `android/app/src/main/java/com/viridiandome/longevity/wearables/sync/InitialWeightSyncViewModel.kt`

The ViewModel is the UI-facing sync controller. It:

- starts the current explicit sync after the user chooses **Sync weight now**;
- refuses sync until the current plan and last successful timestamp have resolved;
- applies `sync_interval_minutes` as the manual cooldown;
- resolves the newest of Django's `last_synced_at` and the durable device cursor;
- starts a new cooldown after `Completed` or valid `NoData`, while failures remain retryable;
- prevents overlapping sync jobs;
- calls `WeightSyncRunner`;
- converts coordinator results into health-safe Compose states: `Idle`, `Syncing`, `NoData`, `Completed`, `Interrupted`, or `Unavailable`;
- aggregates imported/skipped counters from Django receipts;
- cancels and clears its state during logout.

It does not read Health Connect or make HTTP requests itself.

### `InitialWeightSyncViewModelFactory`

Path: `android/app/src/main/java/com/viridiandome/longevity/wearables/sync/InitialWeightSyncViewModelFactory.kt`

The factory contains no synchronization business logic. Android normally creates ViewModels itself, but `InitialWeightSyncViewModel` requires the incremental runner and cursor store. The factory supplies both:

```text
Android asks for InitialWeightSyncViewModel
    ↓
Factory receives the application-level runner and cursor store
    ↓
Factory creates InitialWeightSyncViewModel(runner, cursorStore)
```

### `LongevityApplication`

Path: `android/app/src/main/java/com/viridiandome/longevity/LongevityApplication.kt`

`LongevityApplication` is the current small application-level dependency container. It lazily constructs and shares:

- the encrypted token store;
- authentication repository;
- authenticated API client;
- wearable connection repository;
- wearable upload repository;
- current-subscription sync-policy repository;
- Health Connect adapter;
- durable per-connection cursor store;
- `WeightSyncCoordinator` configured with `IncrementalWeightSyncPlanner`;
- `SubscriptionAwareWeightSyncRunner` used only by WorkManager.

This keeps dependencies out of Compose recomposition without introducing a dependency-injection framework before the MVP needs one.

## 2. Full implemented Android flow

### Startup and authentication

```text
Android launches MainActivity
    ↓
LoginViewModel asks AuthRepository to restore the encrypted JWT session
    ↓
If no session exists, user enters email and password
    ↓
HttpAuthRepository calls Django mobile login
    ↓
Access and refresh tokens are stored through Android Keystore
    ↓
Compose renders authenticated content
```

`AuthenticatedApiClient` adds the access token to product API requests. After a `401`, it performs at most one coordinated refresh-token rotation and retries the original request once.

### Connecting Health Connect

```text
User chooses Connect Health Connect
    ↓
WearableConnectionViewModel checks Health Connect availability
    ↓
Checks READ_WEIGHT permission
    ↓
MainActivity launches Android's system permission contract if required
    ↓
WearableConnectionRepository loads existing backend connections
    ↓
If absent, repository registers health_connect with Django
    ↓
Django verifies authentication and the wearable connection entitlement
    ↓
Django creates or reactivates WearableConnection
    ↓
Android receives the caller-owned connection ID
    ↓
Compose renders Ready
```

Rendering or signing in does not consume a connection slot. Registration begins only after explicit user intent and Health Connect permission resolution.

### Explicit subscription-aware incremental weight sync

```text
User chooses Sync weight now
    ↓
MainActivity obtains the Ready connection ID
    ↓
SyncPolicyViewModel supplies the server-owned cadence
    ↓
InitialWeightSyncViewModel checks the latest device/backend success timestamp
    ↓
If still cooling down, the tap remains disabled
    ↓
InitialWeightSyncViewModel.sync(connectionId)
    ↓
WeightSyncCoordinator
    ↓
IncrementalWeightSyncPlanner
    ↓
AndroidHealthConnectAccess
    ↓
Health Connect returns paginated WeightRecord values
    ↓
Planner keeps Samsung Health records since cursor-overlap, or the previous 30 days on first run
    ↓
Planner creates batches of at most 100
    ↓
Coordinator creates one upload_id for each batch
    ↓
HttpWearableUploadRepository serializes connection_id, upload_id, and entries
    ↓
AuthenticatedApiClient POSTs /api/v1/wearables/uploads/
    ↓
Django authenticates and verifies active connection ownership
    ↓
Django validates and hashes the payload
    ↓
Django creates SyncRun and deduplicates stable external_source_id values
    ↓
New records become MetricEntry rows; identical records are skipped
    ↓
Django completes SyncRun and returns its receipt
    ↓
Coordinator collects receipts
    ↓
ViewModel aggregates imported/skipped counts
    ↓
Compose renders a safe terminal state
    ↓
Completed or valid NoData starts the plan cooldown
```

The Android application does not call React. The web application later reads the same `MetricEntry` rows from Django.

### Logout

The Android logout flow asks Django to revoke the stored refresh token before clearing the encrypted local token pair. After authentication becomes false, `MainActivity` resets both wearable ViewModels; active UI work is cancelled and previous-user connection/sync state is removed.

## 3. Implemented initial-versus-incremental separation

The application no longer reruns a full initial planner after every tap. The implemented split is:

```text
InitialWeightSyncPlanner
    → retained tested reference for a bounded backfill

IncrementalWeightSyncPlanner
    → live foreground and background policy
    → records since the previous successful sync
    → includes a deliberate overlap window for safety
    → falls back to 30 days when no cursor exists

Shared weight-upload coordinator
    → batching
    → retry-stable upload identities
    → repository calls
    → domain results
```

The timestamp-based MVP cursor policy is now implemented and unit-tested at the domain boundary:

- cursors are scoped by backend connection ID so sessions/accounts on the same phone cannot share progress;
- an existing watermark is read with a 24-hour overlap;
- a missing watermark falls back to an exact 30-day window;
- the incremental runner captures its candidate watermark before the read starts;
- `Completed` and valid `NoData` outcomes persist that watermark;
- `Interrupted` outcomes do not advance it.

The overlap is deliberately generous for low-volume weight data. Stable Health Connect record IDs and backend `external_source_id` deduplication make repeated records harmless. Health Connect change tokens remain a stronger later option when edits/deletions and full provider reconciliation are supported.

`SharedPreferencesWeightSyncCursorStore` implements `WeightSyncCursorStore` with private, durable, per-connection epoch-millisecond values. Store recreation, connection isolation, missing values, and corrupted-value removal are verified on the physical phone. `LongevityApplication` constructs the complete incremental runner graph used by the WorkManager adapter.

## 4. Android WorkManager

WorkManager is Android's operating-system-aware scheduler for reliable deferred work. It can run eligible work when:

- the visible app is closed;
- Android recreates the application process;
- network access becomes available;
- battery and Doze restrictions allow execution;
- a temporary failure should be retried.

The worker execution boundary is now implemented:

```text
Android WorkManager starts a worker
    ↓
Worker calls incremental domain sync code directly
    ↓
Worker reads permitted Health Connect records
    ↓
Worker uploads normalized batches to Django
    ↓
Worker returns success, retry, or permanent failure
```

The worker must not use `InitialWeightSyncViewModel`. ViewModels belong to visible UI lifecycles. WorkManager should depend on a domain runner/coordinator supplied from application-level dependencies.

Stable WorkManager `2.11.2` and `work-testing` are now configured. The implemented `WeightSyncResult.toWorkResult()` boundary maps:

- `Completed` and `NoData` to `Result.success()`;
- temporary Health Connect read failure and server/network unavailability to `Result.retry()`;
- permission, conflict, rejection, and missing-session outcomes to `Result.failure()` because automatic retries cannot repair them.

`IncrementalWeightSyncWorker` accepts only a `connection_id` as WorkManager input, calls the injected `WeightSyncRunner`, and returns the mapping above. Missing or blank input is a permanent failure and does not touch Health Connect or Django.

`LongevityWorkerFactory` creates that worker with the application-scoped incremental runner. `LongevityApplication` implements `Configuration.Provider`, and the manifest removes WorkManager's default initializer so the custom factory owns construction. Unknown worker class names return `null`, as required by the `WorkerFactory` chain contract.

`HttpSyncPolicyRepository` reads `automatic_sync_enabled` and `sync_interval_minutes` from `GET /api/v1/subscriptions/current/`. Android never infers scheduling from `plan.code`. `SyncPolicyViewModel` makes that policy available to Compose and the pure scheduling decision.

`WorkManagerWeightSyncScheduler` builds and enqueues one unique periodic request per connection. The request carries only `connection_id`, requires a connected network, uses the validated server interval (currently Pro 15 minutes), and has a stable tag for account-level cleanup. Reapplying the same connection uses `ExistingPeriodicWorkPolicy.UPDATE`, so Compose state changes do not create duplicate schedules. Android and PostgreSQL both reject an automatically syncing interval below WorkManager's 15-minute minimum.

`MainActivity` applies a pure, tested scheduling decision. It schedules only when the local session is authenticated, the caller-owned connection is Ready, background access is granted, and server policy enables automatic sync. A manual-only policy cancels tagged work, closing the normal downgrade path. It does nothing during startup session or policy checking because WorkManager state survives process restarts; treating temporary unresolved state as logout would incorrectly erase valid work. A confirmed successful logout cancels every tagged weight-sync request. Connection-disconnect cancellation remains pending until the Android disconnect action exists.

The worker receives a `SubscriptionAwareWeightSyncRunner`. It fetches the current policy again immediately before device access. Therefore stale queued work that races with a downgrade stops before reading Health Connect. A transient policy failure maps to retry; a manual-only policy maps to permanent failure for that execution.

Periodic WorkManager execution is inexact. Android may delay work because of Doze, battery optimization, and other constraints. The platform has a 15-minute minimum periodic interval, but a 15-minute request is not a guarantee that work runs exactly every 15 minutes.

Background Health Connect reads also require:

- the ordinary record permission, currently `READ_WEIGHT`;
- `READ_HEALTH_DATA_IN_BACKGROUND`;
- a feature-availability check;
- explicit permission granted while the app is in the foreground.

The app checks `FEATURE_READ_HEALTH_DATA_IN_BACKGROUND` through the Health Connect client and maps it to `Granted`, `PermissionRequired`, or `Unavailable`. An already-ready Pro connection exposes **Allow background sync** only for `PermissionRequired`; Free/manual-only plans and unsupported devices keep manual sync without presenting an unusable action. The official permission Activity Result updates only local capability state and never repeats backend connection registration.

The manual cooldown is enforced by the official Android UI and ViewModel, using the newest successful timestamp from the device cursor and Django connection. It is not currently an upload-endpoint rate limit: one logical sync may legitimately POST multiple batches, so per-request throttling would reject valid work. If abuse control is later required, add a server-recognized logical sync-attempt identity rather than throttling individual batch requests.

References:

- [Health Connect background reads](https://developer.android.com/health-and-fitness/health-connect/read-data)
- [Health Connect permission reference](https://developer.android.com/reference/androidx/health/connect/client/permission/HealthPermission)
- [WorkManager periodic-work reference](https://developer.android.com/reference/androidx/work/PeriodicWorkRequest)
- [Define WorkManager requests](https://developer.android.com/develop/background-work/background-tasks/persistent/getting-started/define-work)
- [Update unique WorkManager work](https://developer.android.com/develop/background-work/background-tasks/persistent/how-to/update-work)

## 5. WorkManager versus Celery

WorkManager and Celery run on opposite sides of the system.

| Component | Runs where | Can read Health Connect? | Responsibility |
|---|---|---:|---|
| WorkManager | Android phone | Yes, with permission | Wake the device bridge, read on-device records, and upload normalized batches |
| Django | Backend | No | Authenticate, authorize, validate, and expose the ingestion API |
| Redis | Backend | No | Temporarily transport Celery task messages |
| Celery | Backend worker | No | Process data already received by Django |
| Celery Beat | Backend scheduler | No | Schedule backend maintenance, reconciliation, and repair jobs |

Celery cannot wake an offline phone and cannot directly read Health Connect.

### Current synchronous backend flow

```text
Android POST
    ↓
Django validates
    ↓
Django writes SyncRun and MetricEntry
    ↓
Django returns 200 or 201
```

Celery is not currently needed for wearable ingestion.

### Future asynchronous backend flow

When batches or processing become expensive:

```text
WorkManager uploads a batch
    ↓
Django authenticates, authorizes, validates bounds, and creates SyncRun(received)
    ↓
Django publishes a task through Redis
    ↓
Django returns 202 quickly
    ↓
Celery claims the SyncRun and processes the validated batch
    ↓
Celery writes MetricEntry rows
    ↓
Celery marks SyncRun succeeded or failed
```

PostgreSQL remains the source of truth for upload identity, processing state, counters, errors, and metric data. Redis is only the temporary broker. Database idempotency and uniqueness constraints remain required because Celery tasks can be delivered more than once.

The responsibility split is:

```text
WorkManager gets data off the phone.

Celery processes data after it reaches the backend.
```

## 6. Recommended next implementation order

1. ~~Extract or define a shared weight-upload orchestration boundary without changing the successful initial flow.~~ Completed.
2. ~~Add and test an incremental read-window policy with a deliberate overlap.~~ Completed at the domain boundary.
3. ~~Implement and test a durable per-connection cursor-store adapter.~~ Completed and physically verified.
4. ~~Add stable WorkManager runtime/testing dependencies and test the domain-to-work result policy.~~ Completed.
5. ~~Implement and test an injected `CoroutineWorker` that calls the incremental runner, never the UI ViewModel.~~ Completed and physically verified.
6. ~~Add the background Health Connect feature check, manifest permission, and foreground permission request.~~ Implemented and physically granted.
7. ~~Schedule one unique network-constrained periodic job only for an authenticated user with a Ready connection and granted background access.~~ Implemented.
8. ~~Consume server-owned subscription policy, cancel automatic work for Free, pass the server interval to WorkManager, and recheck entitlement inside each worker.~~ Completed.
9. ~~Gate explicit sync with the durable plan cooldown and reuse the incremental runner for foreground taps.~~ Completed.
10. Cancel the user's unique background work on connection disconnect when the Android disconnect action is added. Logout and downgrade cancellation are implemented.
11. Validate the subscription-aware worker on the physical phone with the visible app closed.
12. Add Celery/Redis ingestion only after synchronous backend processing becomes a measured bottleneck or requires server-independent retries.
