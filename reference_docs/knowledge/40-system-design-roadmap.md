# System Design Roadmap: Local MVP to Production

Current state, bluntly: the project has a working hosted staging value loop. The public HTTPS frontend and API, Stripe test-mode lifecycle, monitored database backup and restore, and Android authentication and Weight/Steps ingestion are deployed. On 2026-09-17 the operator reported that automatic Android sync reaches the hosted backend and the data appears correctly in the frontend. The remaining staging acceptance work is to record the deployed image digest and test conditions and check that application logs expose no credentials, tokens, or health data. Reliable application monitoring, richer analytics, additional health metrics, asynchronous server processing, and production hardening remain later work.

## 1. Local system design — what exists now

Local runtime is roughly:

```text
Browser
  ↓
React/Vite frontend
  ↓
Django REST API
  ↓
PostgreSQL 16

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
- TimescaleDB is not enabled: current migrations and CI use ordinary PostgreSQL.
  Consider it later only when measured needs justify hypertables, continuous
  aggregates, retention, or compression and a tested migration exists.
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
- AWS account security baseline: root passkey/MFA, no root access keys, and separate everyday IAM administration
- AWS CLI temporary login profile plus a one-hour `LongevityAgentViewOnly` assumed-role profile
- Agent Toolkit for AWS configured against `eu-central-1` with an initial read-only MCP boundary
- Monthly AWS Budget alert and explicit Free-plan credit constraint

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

   Backend quality gates, Android JVM tests, the physical-device connected suite, Structurizr validation, and live Weight-plus-Steps synchronization passed at the local checkpoint. On 2026-09-17 the operator reported the same Weight-plus-Steps value loop working through public staging and appearing in the hosted frontend.

## 3. Important gaps

The project now has the basic value loop:

```text
Wearable data → device sync → normalized metrics → dashboard trends
```

The remaining product-value gap is the final step: richer, actionable insight. Pro Insights is mostly a placeholder; it proves feature gating and UI placement, but not deep user value.

Still missing:

- production deployment with separate resilient infrastructure
- a signed APK and free Android Developer Console limited distribution for up to 20 authorized pilot devices; public Google Play distribution remains a separate paid goal
- reliable application logs and alerts for API, Stripe webhook, and wearable failures
- real analytics endpoint
- trend calculations
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
PostgreSQL 16

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

Hosted staging checkpoint:

```text
Public HTTPS staging deployment
    → Android automatic Weight + Steps sync to hosted API
    → hosted frontend displays the synced data
    → record acceptance evidence and add application monitoring
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

12. Deploy a public HTTPS staging environment — deployed; acceptance evidence remains

   The cost-bounded presentation staging environment is deployed: CloudFront, private S3/OAC, Route 53, one public `t4g.small` EC2 Docker host, Nginx, Gunicorn/Django, PostgreSQL 16 on encrypted EBS, monitored `pg_dump` backups, Secrets Manager, ECR, and CloudWatch backup/restore alarms. The public Stripe test webhook is verified. The operator reports hosted Android automatic Weight and Steps sync and correct frontend display; record its image digest and test conditions and complete the log privacy check before closing acceptance.

13. Add asynchronous server processing — deferred until justified

   Keep bounded uploads synchronous while they are fast and reliable. Introduce Redis and Celery when measured latency, larger backfills, analytics, repair jobs, exports, or maintenance work needs a durable server-side queue.

14. Add another Health Connect metric — after staging

   Heart Rate is the strongest next candidate because it adds product value and exercises higher-volume instantaneous time-series batching. Sleep remains later because sessions, stages, overlap, and provider edits require more domain design.

Related doc:

- `reference_docs/knowledge/27-integration-modes.md`
- `reference_docs/knowledge/41-wearable-ingestion-android-and-async-roadmap.md`

## 5. Online deployment design

For the first online presentation deployment, the pragmatic target is:

```text
User Browser
  ↓
CloudFront
  ├── private S3 React build
  └── uncached /api/* → Nginx HTTPS origin
                           ↓
                    EC2 + Docker Compose
                      ├── Django API container
                      ├── one-off migration container
                      └── PostgreSQL 16 container
                               ↓ encrypted EBS
                    scheduled pg_dump → private S3 backups

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

Deployment progression:

```text
Manually provision the single-host presentation staging topology and record a runbook
    ↓
Provision the separate production topology with Terraform
    ↓
CloudFront/WAF → ALB → two Fargate API tasks → RDS PostgreSQL Multi-AZ
    ↓
Add worker infrastructure only when justified
```

EC2 is the presentation-staging compute platform. It is intentionally not the
production resilience target. Terraform is the source of truth for the later
ALB/Fargate/RDS production infrastructure. The staging deployment pipeline is a
separate concern: it builds a tested image, pushes it to ECR, invokes EC2 through
Systems Manager, runs migrations, replaces Django, and verifies health checks.

Android environment boundary:

```text
debug   → http://127.0.0.1:8000/ through adb reverse
staging → API origin https://staging.<domain>/ plus /api/... endpoint path
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
- staging `pg_dump` backups and a restore drill; production RDS automated backups and PITR
- health checks
- API logging
- error monitoring
- CI running tests before deploy
- a staging-first deployment pipeline before production automation
- a documented manual staging runbook followed by Terraform-managed ALB/Fargate/RDS before real production use
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
PostgreSQL 16
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
Finish staging acceptance and prepare a free 20-device Android pilot
```

The public staging frontend, API, database, Stripe test webhook, and monitored
backup/restore jobs are deployed. The operator reports successful automatic
Android Weight and Steps sync and correct frontend display. Record the deployed
image digest and test conditions, verify that logs contain no credentials,
tokens, or health data, and add Django/Nginx application logs and failure alerts.
For the selected free pilot, the owner created an Android Developer Console
limited-distribution account and, on 2026-09-18, showed the new package
`com.viridiandome.longevity.pilot` as Registered with its key Verified. A signed
pilot APK has been built locally. Back up its private signing key and password,
then host the APK at an HTTPS download link. Authorize each
pilot phone through Google's link/code flow before its owner installs the APK;
verify a first install and a same-key update without `adb`. The limit is 20
authorized devices, and this route does not list the app on Google Play. The
current staging image acceptance covers demo/test data only, so do not collect
other users' real health data there. The staging architecture and manual
release procedure are in
`reference_docs/playbooks/presentation-staging-manual-provisioning.md`.

Before real production users, build the separate CloudFront/WAF, ALB, two-task
Fargate, and RDS PostgreSQL Multi-AZ topology in Terraform. Add Celery/Redis only
when synchronous ingestion is a measured bottleneck or another server-side
workflow needs durable asynchronous execution. Additional metrics follow
staging; Heart Rate is the likely next mapping, while Sleep requires a separate
domain-design pass.
