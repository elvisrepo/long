# Android Sync Coordination, WorkManager, and Celery

## When to use this document

Use this document when:

- changing the Android weight-sync pipeline;
- deciding whether logic belongs in a planner, coordinator, ViewModel, or worker;
- separating initial backfill from incremental background synchronization;
- deciding when Android WorkManager, Django, Redis, Celery, or Celery Beat should run work.

This document describes the implemented Android flow as of 2026-08-06 and the agreed next architecture. The current Android slice supports weight records only.

## 1. Implemented Android sync components

There is no `InitialHealthSyncCoordinator`. The implemented class is `InitialWeightSyncCoordinator`, because the current slice handles only weight records.

### `InitialWeightSyncPlanner`

Path: `android/app/src/main/java/com/viridiandome/longevity/wearables/sync/InitialWeightSyncPlanner.kt`

The planner decides which Health Connect data belongs in the initial upload:

1. Build a 30-day window ending at the current injected UTC clock time.
2. Read weight records through `HealthConnectWeightReader`.
3. Keep only records whose source package is Samsung Health: `com.sec.android.app.shealth`.
4. Preserve chronological order.
5. Split the selected records into batches of at most 100.

The planner does not perform HTTP requests, generate upload IDs, or update Compose state.

### `InitialWeightSyncCoordinator`

Path: `android/app/src/main/java/com/viridiandome/longevity/wearables/sync/InitialWeightSyncCoordinator.kt`

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

### `InitialWeightSyncRunner`

`InitialWeightSyncRunner` is the small interface implemented by the coordinator:

```kotlin
suspend fun sync(connectionId: String): InitialWeightSyncResult
```

The ViewModel depends on this interface instead of the concrete coordinator. Tests can supply a fake runner without using Health Connect, Django, or a physical phone. A future WorkManager worker can depend on an appropriate runner without depending on the UI ViewModel.

### `InitialWeightSyncViewModel`

Path: `android/app/src/main/java/com/viridiandome/longevity/wearables/sync/InitialWeightSyncViewModel.kt`

The ViewModel is the UI-facing sync controller. It:

- starts the current explicit sync after the user chooses **Sync weight now**;
- prevents overlapping sync jobs;
- calls `InitialWeightSyncRunner`;
- converts coordinator results into health-safe Compose states: `Idle`, `Syncing`, `NoData`, `Completed`, `Interrupted`, or `Unavailable`;
- aggregates imported/skipped counters from Django receipts;
- cancels and clears its state during logout.

It does not read Health Connect or make HTTP requests itself.

### `InitialWeightSyncViewModelFactory`

Path: `android/app/src/main/java/com/viridiandome/longevity/wearables/sync/InitialWeightSyncViewModelFactory.kt`

The factory contains no synchronization business logic. Android normally creates ViewModels itself, but `InitialWeightSyncViewModel` requires an `InitialWeightSyncRunner` constructor dependency. The factory supplies it:

```text
Android asks for InitialWeightSyncViewModel
    ↓
Factory receives the application-level runner
    ↓
Factory creates InitialWeightSyncViewModel(runner)
```

### `LongevityApplication`

Path: `android/app/src/main/java/com/viridiandome/longevity/LongevityApplication.kt`

`LongevityApplication` is the current small application-level dependency container. It lazily constructs and shares:

- the encrypted token store;
- authentication repository;
- authenticated API client;
- wearable connection repository;
- wearable upload repository;
- Health Connect adapter;
- initial weight planner;
- initial weight coordinator.

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

### Explicit initial weight sync

```text
User chooses Sync weight now
    ↓
MainActivity obtains the Ready connection ID
    ↓
InitialWeightSyncViewModel.sync(connectionId)
    ↓
InitialWeightSyncCoordinator
    ↓
InitialWeightSyncPlanner
    ↓
AndroidHealthConnectAccess
    ↓
Health Connect returns paginated WeightRecord values
    ↓
Planner keeps Samsung Health records from the previous 30 days
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
```

The Android application does not call React. The web application later reads the same `MetricEntry` rows from Django.

### Logout

The Android logout flow asks Django to revoke the stored refresh token before clearing the encrypted local token pair. After authentication becomes false, `MainActivity` resets both wearable ViewModels; active UI work is cancelled and previous-user connection/sync state is removed.

## 3. Agreed separation: initial versus incremental sync

The current planner is intentionally an initial 30-day backfill planner. Reusing it every 15 minutes would be safe because Health Connect record IDs and backend deduplication are stable, but it would repeatedly reread and re-upload the same 30-day history.

Do not turn `InitialWeightSyncPlanner` into the permanent background planner.

The agreed direction is:

```text
InitialWeightSyncPlanner
    → first bounded 30-day backfill

IncrementalWeightSyncPlanner
    → records since the previous successful sync
    → includes a deliberate overlap window for safety

Shared weight-upload coordinator
    → batching
    → retry-stable upload identities
    → repository calls
    → domain results
```

The exact incremental cursor policy must be decided and tested before periodic execution is wired. A timestamp plus a small overlap is a pragmatic MVP option because stable external record IDs make repeated records harmless. Health Connect change tokens are a stronger later option when edits/deletions and full provider reconciliation are supported.

## 4. Android WorkManager

WorkManager is Android's operating-system-aware scheduler for reliable deferred work. It can run eligible work when:

- the visible app is closed;
- Android recreates the application process;
- network access becomes available;
- battery and Doze restrictions allow execution;
- a temporary failure should be retried.

The intended background flow is:

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

Periodic WorkManager execution is inexact. Android may delay work because of Doze, battery optimization, and other constraints. The platform has a 15-minute minimum periodic interval, but a 15-minute request is not a guarantee that work runs exactly every 15 minutes.

Background Health Connect reads also require:

- the ordinary record permission, currently `READ_WEIGHT`;
- `READ_HEALTH_DATA_IN_BACKGROUND`;
- a feature-availability check;
- explicit permission granted while the app is in the foreground.

References:

- [Health Connect background reads](https://developer.android.com/health-and-fitness/health-connect/read-data)
- [Health Connect permission reference](https://developer.android.com/reference/androidx/health/connect/client/permission/HealthPermission)
- [WorkManager periodic-work reference](https://developer.android.com/reference/androidx/work/PeriodicWorkRequest)

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

1. Extract or define a shared weight-upload orchestration boundary without changing the successful initial flow.
2. Add and test an incremental read-window policy with a deliberate overlap.
3. Add WorkManager and worker test infrastructure.
4. Implement a worker that calls the incremental runner, never the UI ViewModel.
5. Map domain outcomes to WorkManager `success`, `retry`, and permanent `failure` deliberately.
6. Add the background Health Connect feature check, manifest permission, and foreground permission request.
7. Schedule one unique network-constrained periodic job only for an authenticated user with a Ready connection and granted background access.
8. Cancel the user's unique background work on logout or connection disconnect.
9. Validate the worker on the physical phone with the visible app closed.
10. Add Celery/Redis ingestion only after synchronous backend processing becomes a measured bottleneck or requires server-independent retries.
