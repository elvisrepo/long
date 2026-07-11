# System Design Roadmap: Local MVP to Production

Current state, bluntly: the project has a solid local MVP foundation, but it is not the final product yet. Manual metrics and Stripe subscription lifecycle are in good shape. Wearable sync, richer analytics, production deployment, and compliance hardening are still ahead.

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

- wearable/device sync
- Android companion app
- ingestion idempotency for wearable samples
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

Android companion app
  ↓
Health Connect / Samsung Health
  ↓
Django ingestion API
  ↓
MetricEntry storage

Stripe
  ↓
Checkout / Portal / Webhooks
  ↓
Subscription + entitlement state
```

The next major product slice should be wearable sync groundwork.

Immediate next slice:

```text
WearableConnection model + authenticated connection API
```

This is intentionally smaller than full wearable sync. It should establish local backend state first, then the Android companion app and ingestion path can build on top of it.

Recommended order:

1. Add `WearableConnection`

   Store provider, status, user, last sync time, and error state.

   First-slice fields should be minimal: `user`, `provider`, `status`, `last_synced_at`, `last_error`, `created_at`, and `updated_at`.

2. Add connection status API

   Frontend can show connected, not connected, or sync failed.

   Start with authenticated list/create/update behavior. Scope every read/write to `request.user`.

3. Add ingestion endpoint

   Android companion app can upload metric samples.

4. Add idempotency

   Avoid duplicate samples if the app retries uploads.

5. Normalize wearable data into existing `MetricEntry`

   Do not create a parallel metric system.

6. Add sync UI

   Settings or a dedicated Wearables page shows connection state and last sync.

Related doc:

- `reference_docs/knowledge/27-integration-modes.md`

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

- Health Connect / Samsung Health sync
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
WearableConnection model + API
```

This should come before more analytics polish, more Stripe work, or production deployment.

Reason: wearable sync is the missing bridge from manual tracker to longevity product. Once the connection model and ingestion path exist, the rest of the final architecture starts becoming real.
