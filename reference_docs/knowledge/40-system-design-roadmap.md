# System Design Roadmap: Local MVP to Production

Current state, bluntly: the project has a solid local MVP foundation, but it is not the final product yet. Manual metrics, Stripe subscription lifecycle, synchronous wearable ingestion, Android mobile authentication, Health Connect weight reads, and subscription-aware device scheduling are in good shape. Additional health metrics, richer analytics, production deployment, and compliance hardening are still ahead.

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
- Celery becomes important for wearable sync, provider retries, backfills, analytics precomputation, maintenance jobs, and account export/delete work.

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

5. Test posture

   Backend and frontend suites pass after the billing, Settings, and Pro Insights work.

## 3. Important gaps

The project does not yet have the real final product value loop:

```text
Wearable data → automatic ingestion → normalized metrics → useful trends → user insight
```

Right now, Pro Insights is mostly a placeholder. It proves feature gating and UI placement, but not deep user value.

Still missing:

- Android registration/read of its backend Health Connect connection
- Health Connect availability and permission flow
- Health Connect `WeightRecord` reads and Samsung-origin filtering
- Android normalization and upload to the implemented ingestion endpoint
- retryable Android WorkManager scheduling
- real analytics endpoint
- trend calculations
- production deployment
- monitoring/alerts
- backup/restore implementation
- GDPR export/delete
- password reset / stronger account lifecycle flows

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
Physical closed-app periodic validation, then user-visible sync status
```

The Android project at `android/` now implements mobile authentication, Keystore-backed JWT storage and rotation, Health Connect weight permission/read, caller-owned connection registration, normalized incremental upload, subscription-aware manual cooldowns, Pro WorkManager scheduling, and connection disconnect. A physical phone has completed the Samsung Health → Health Connect → Android → Django → React weight path. Disconnect is covered on-device at the UI/cursor boundaries and cancels connection-scoped work after Django confirms the soft disconnect.

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

7. Read and upload Health Connect weight records — completed

   The physical-device bridge is proven through the synchronous upload endpoint.

8. Add subscription-aware manual and periodic sync UI — completed

   Free receives a server-owned cooldown; Pro receives periodic scheduling.

9. Add Android connection disconnect — completed

   Django soft-disconnects first; Android then cancels only that connection's work and clears its cursor.

10. Validate automatic work with the visible app closed — in progress

   Foreground periodic execution is proven. A process-death test proved the unique WorkManager request survives and becomes runnable, but Honor OS delayed dispatch beyond the 15-minute minimum. Complete a normal Home/swipe-away run and require a new Django `SyncRun` before marking closed-app ingestion complete. Explicit Android Force stop is out of scope because the platform suppresses all app work until relaunch.

11. Add richer sync status UI — partially completed

   Android now shows connection state, honest approximate scheduling language, and the latest successful Django sync time. A dedicated history/error view remains later work.

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

Worker container
  ↓
Redis / queue

Stripe
  ↓
Public HTTPS webhook endpoint
  ↓
Django webhook view
```

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

- Samsung Health-originated sync through Health Connect and the Android companion app
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
Validate normal-background periodic ingestion and document OEM battery guidance
```

This closes the remaining device-runtime uncertainty before adding more metric types or beginning production distribution. The UI already exposes the latest successful sync and avoids promising exact WorkManager timing. Celery/Redis remains deferred until synchronous ingestion is a measured bottleneck or needs server-independent retries.
