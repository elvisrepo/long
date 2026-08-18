# System Design Roadmap: Local MVP to Production

Current state, bluntly: the project now has a working local MVP value loop. Manual metrics, Stripe subscription lifecycle, synchronous wearable ingestion, Android mobile authentication, Health Connect Weight and Steps reads, version-aware provider-record upserts, and subscription-aware device scheduling are proven. The next major milestone is a public HTTPS staging deployment; richer analytics, additional health metrics, asynchronous server processing, and compliance hardening remain later work.

## 1. Local system design — what exists now

Local runtime is roughly:

```text
Browser
  ↓
React/Vite frontend
  ↓
Django REST API
  ↓
PostgreSQL / TimescaleDB

Redis + Celery exist for background work
Stripe CLI forwards local webhooks to Django

Android Studio + Gradle + adb
  ↓ installs debug and test APKs over USB
Physical Android phone
  ↓ authenticates against local Django through adb reverse
Android companion app
```

Current runtime nuance:

- PostgreSQL is required for the implemented application.
- TimescaleDB-specific capabilities are not yet materially used; the database currently behaves mostly like normal PostgreSQL until hypertables, continuous aggregates, retention, or compression policies are introduced.
- Redis, Celery Worker, and Celery Beat are present locally but are prepared infrastructure. Current auth, manual metrics, Settings, Stripe Checkout, Stripe Portal, and webhook reconciliation flows run synchronously in Django.
- Android WorkManager owns device-side scheduling because only the phone can read Health Connect. Celery cannot fetch on-device records.
- Celery becomes useful later for expensive server-side processing, repair/retry jobs, large backfills, analytics precomputation, maintenance jobs, and account export/delete work. It is not required for the first bounded synchronous staging deployment.

Implemented slices:

- Auth/account basics
- Manual metric definitions
- Custom metrics
- Manual metric tracking
- Dashboard + metric detail UI
- Free vs Pro subscription plans
- Stripe Checkout
- Stripe Customer Portal
- Stripe webhook handling
- Scheduled cancellation / renewal handling
- Local subscription state synced from Stripe
- Settings billing UI
- Basic Pro Insights scaffold
- Health Connect connection lifecycle and plan limits
- Idempotent synchronous wearable upload ingestion into `MetricEntry`
- Kotlin/Compose Android project scaffold
- Android login, refresh, encrypted JWT storage, session checking, and server-revoking logout
- Stateful Android authentication UI with JVM, Compose, and physical-device validation
- Health Connect Weight and Steps permission, read, normalization, batching, and combined sync
- Subscription-aware manual cooldowns and Pro WorkManager scheduling
- Health Connect connection registration, reactivation, and disconnect
- Stable provider-record deduplication plus newer-version updates using Health Connect modification timestamps
- Live physical-device Weight and Steps synchronization through Django into the React frontend

Related docs:

- `reference_docs/knowledge/05-local-development-architecture.md`
- `reference_docs/knowledge/12-current-local-docker-runtime.md`
- `reference_docs/knowledge/20-frontend-development.md`
- `reference_docs/knowledge/38-stripe-testing-and-load-testing.md`

## 2. Solid completed areas

The strongest completed parts are:

1. Metrics core

   Users can define and track health/longevity metrics manually.

2. Subscription monetization

   Stripe Checkout, Portal, subscription updates, cancellation scheduling, cancellation undo, and final downgrade are wired.

3. Entitlement split

   Free and Pro users see different limits/features. The backend remains the source of truth.

4. API contracts

   The frontend gets enough subscription state to show:

   - current plan
   - billing interval
   - renewal date
   - cancellation date
   - whether portal management is available

5. Wearable value loop

   The physical Android client reads Samsung-originated Weight and Steps data
   through Health Connect, uploads normalized batches, and exposes the resulting
   metrics through the existing React dashboard. New records import, identical
   overlap records skip, and newer versions of mutable provider records update.

6. Test posture

   Backend quality gates, Android JVM tests, the physical-device connected suite, Structurizr validation, and live Weight-plus-Steps synchronization have passed at the latest checkpoint. Frontend tests remain part of the deployment gate before staging.

## 3. Important gaps

The project now has the basic value loop:

```text
Wearable data → device sync → normalized metrics → dashboard trends
```

The remaining product-value gap is the final step: richer, actionable insight. Pro Insights is mostly a placeholder; it proves feature gating and UI placement, but not deep user value.

Still missing:

- public HTTPS staging and production deployments
- Android staging/release API base URLs and signed distribution builds
- reliable observability for API, Stripe webhook, and wearable failures
- real analytics endpoint
- trend calculations
- monitoring/alerts
- backup/restore implementation
- GDPR export/delete
- password reset / stronger account lifecycle flows
- additional deliberately mapped Health Connect metrics, with Heart Rate the likely next candidate
- richer sync history/repair UI
- server-side asynchronous processing if synchronous ingestion becomes too slow or operationally expensive

## 4. MVP system design — next target

The MVP should become:

```text
Browser SPA
  ↓
Django API
  ↓
Postgres / TimescaleDB

Samsung Health
  ↓ writes records into
Health Connect
  ↓ read on device by
Android companion app
  ↓ uploads normalized samples to
Django ingestion API
  ↓
MetricEntry storage

Stripe
  ↓
Checkout / Portal / Webhooks
  ↓
Subscription + entitlement state
```

The wearable backend is implemented through normalized synchronous ingestion: plan-limited Health Connect registration, owner-scoped lifecycle reads, soft disconnect/reactivation, `SyncRun` idempotency, canonical payload hashing, external-record deduplication, conflict handling, and normalized `MetricEntry` persistence.

Immediate next slice:

```text
Production-readiness pass
    → public HTTPS staging deployment
    → Android staging build using the public API
    → remote Weight + Steps + Stripe validation
```

The Android project at `android/` implements mobile authentication, Keystore-backed JWT storage and rotation, Health Connect Weight and Steps permission/read, caller-owned connection registration, normalized incremental upload, subscription-aware manual cooldowns, Pro WorkManager scheduling, and connection disconnect. A physical phone has completed the Samsung Health → Health Connect → Android → Django → React path for both metrics. Live verification proved a newly added Weight record imports and an evolving Steps record updates through its newer Health Connect modification timestamp. Disconnect is covered on-device at the UI/cursor boundaries and cancels connection-scoped work after Django confirms the soft disconnect.

Refactor trigger before ingestion grows:

- `WearableConnectionSerializer.create()` currently coordinates registration/reactivation, user and connection row locks, entitlement validation, state reset, and persistence.
- Keep that code in the serializer while it is the single creation workflow, but extract it into `backend/apps/wearables/services.py` when `SyncRun` ingestion adds more connection transitions or when another caller must reuse registration/reactivation.
- After extraction, serializers should remain responsible for request validation and representation; the service should own transactional connection lifecycle rules.

Recommended order:

1. Add `SyncRun` with a client-generated `upload_id` — completed

   Preserve one batch receipt per connection/upload ID for retry idempotency and troubleshooting.

2. Add ingestion endpoint — completed

   Android companion app can upload metric samples.

3. Enforce idempotency — completed

   Avoid duplicate samples if the app retries uploads.

4. Normalize wearable data into existing `MetricEntry` — completed

   Do not create a parallel metric system.

5. Authenticate the Android client — completed

   Dedicated mobile login, refresh, encrypted storage, session restoration, and server-revoking logout are implemented.

6. Register/read the Android Health Connect connection — completed

   The client establishes and reuses the caller-owned backend connection.

7. Read and upload Health Connect Weight and Steps records — completed

   The physical-device bridge is proven through the synchronous upload endpoint. Weight exercises low-frequency instantaneous records; Steps exercises mutable interval records and version-aware updates.

8. Add subscription-aware manual and periodic sync UI — completed

   Free receives a server-owned cooldown; Pro receives periodic scheduling.

9. Add Android connection disconnect — completed

   Django soft-disconnects first; Android then cancels only that connection's work and clears its cursor.

10. Characterize automatic work with the visible app closed — completed for the current MVP contract

   Foreground periodic execution is proven. Process-death and normal-Home tests proved the unique WorkManager request survives, but Honor OS may defer execution until Longevity is reopened. Reopening then catches up Health Connect history through the overlap cursor. The UI therefore promises approximate scheduling, not an exact 15-minute deadline. Stronger OEM-specific background guidance and validation remain optional hardening; explicit Android Force stop is out of scope because the platform suppresses app work until relaunch.

11. Add richer sync status UI — partially completed

   Android now shows connection state, honest approximate scheduling language, and the latest successful Django sync time. A dedicated history/error view remains later work.

12. Deploy a public HTTPS staging environment — next

   Host the React frontend, Django API, and managed PostgreSQL database; configure a public Stripe test webhook; add health checks, logs, migrations, backups, and secure production settings; then prove Weight and Steps sync without USB or `adb reverse`.

13. Add asynchronous server processing — deferred until justified

   Keep bounded uploads synchronous while they are fast and reliable. Introduce Redis and Celery when measured latency, larger backfills, analytics, repair jobs, exports, or maintenance work needs a durable server-side queue.

14. Add another Health Connect metric — after staging

   Heart Rate is the strongest next candidate because it adds product value and exercises higher-volume instantaneous time-series batching. Sleep remains later because sessions, stages, overlap, and provider edits require more domain design.

Related doc:

- `reference_docs/knowledge/27-integration-modes.md`
- `reference_docs/knowledge/41-wearable-ingestion-android-and-async-roadmap.md`

## 5. Online deployment design

For the first online deployment, the pragmatic target should be:

```text
User Browser
  ↓
HTTPS / CDN / Static frontend hosting
  ↓
Django API container
  ↓
Managed Postgres / TimescaleDB

Stripe
  ↓
Public HTTPS webhook endpoint
  ↓
Django webhook view
```

The first staging deployment can omit Redis, Celery Worker, and Celery Beat.
The current upload endpoint accepts at most 100 entries and completes the
idempotent transaction synchronously. Add worker infrastructure when a measured
server-side workload requires it rather than merely because Compose already
contains it.

Android environment boundary:

```text
debug   → http://127.0.0.1:8000/ through adb reverse
staging → https://api-staging.<domain>/ over the internet
release → https://api.<domain>/ over the internet
```

The hosted Android flow uses the same Bearer JWT login, refresh, connection,
subscription-policy, and upload contracts. Only the configured API base URL
changes; HTTPS replaces the temporary USB reverse tunnel. A distributable build
also needs release signing and an installation channel such as Play Internal
Testing.

Production needs:

- real domain
- HTTPS
- production environment variables
- Stripe live/test mode separation
- database migrations in the deploy flow
- managed Postgres backups
- health checks
- API logging
- error monitoring
- CI running tests before deploy
- secure CORS/CSRF/session settings
- Android environment-specific HTTPS API base URLs
- Android release signing and private/internal distribution for staging

Related docs:

- `reference_docs/knowledge/06-pragmatic-mvp-cloud-architecture.md`
- `reference_docs/knowledge/23-production-deployment.md`
- `reference_docs/knowledge/24-monitoring-and-maintenance.md`

## 6. Final system design direction

Final target:

```text
Web app
Mobile companion app
Backend API
Postgres / TimescaleDB
Redis / background workers
Stripe billing
Wearable/device integrations
Analytics pipeline
Monitoring + audit + compliance
```

Future mature capabilities:

- broader Samsung Health-originated sync through Health Connect and the Android companion app
- Apple Health support later
- direct cloud integrations where useful
- optional aggregator integration later
- richer Pro analytics
- trends, deltas, averages, anomaly detection
- export/delete account data
- audit logs
- background backfills
- retryable sync jobs
- production observability
- infrastructure as code

Related docs:

- `reference_docs/knowledge/07-full-requirements-architecture.md`
- `reference_docs/knowledge/19-backend-development-roadmap.md`
- `reference_docs/knowledge/30-c4-container-diagram.md`
- `reference_docs/knowledge/36-c4-deployment-diagram.md`

## 7. Recommended next build step

Next real system-design step:

```text
Prepare and deploy a public HTTPS staging environment
```

The staging slice should configure production-safe Django settings, managed PostgreSQL, migrations, backups, health checks, structured logs, a public Stripe test webhook, frontend hosting, and an Android staging API base URL. Its exit condition is a physical phone synchronizing Weight and Steps over ordinary Wi-Fi or mobile data into the hosted frontend without USB or `adb reverse`.

Celery/Redis remains deferred until synchronous ingestion is a measured bottleneck or another server-side workflow needs durable asynchronous execution. Additional metrics follow staging; Heart Rate is the likely next mapping, while Sleep requires a separate domain-design pass.
