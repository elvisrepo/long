# Longevity Health Tracker — Complete Project Plan

---

## 1. Planning & Requirements

### 1.1 Problem Definition & Audience

**1.1.1 Why am I making this project?**
- To build a sellable health-tracking product that solves a real problem
- To demonstrate senior-level backend engineering across auth, payments, time-series data, real-time streaming, and third-party integrations
- To learn and apply production-grade DevOps practices (Docker, CI/CD, IaC, monitoring)

**1.1.2 Who is this for?**
- Primary: Health-conscious individuals (25–45) tracking longevity metrics (VO2 Max, HRV, resting HR, sleep, body composition)
- Secondary: Biohackers and quantified-self enthusiasts who want one dashboard for all their health data sources

**1.1.3 What makes it valuable?**
- Unified view across manual entries + Samsung Health sync on Android in MVP, with additional providers added later
- Long-term trend analysis — not just today's data, but months/years of context
- Clean, premium, dark-mode UX — most health apps are cluttered and ugly

### 1.2 Functional Requirements

**Core features (top 3 — what the system must do):**

1. **Users should be able to log health metrics** — manually enter data points (heart rate, VO2 Max, weight, etc.) with timestamps
2. **Users should be able to view their metrics on a dashboard with trend analytics** — see current values, 7/30/90-day trends, averages, min/max
3. **Users should be able to connect Samsung Health on Android** — sync data automatically through an Android companion app that reads on-device health data and uploads it securely to our backend

**Secondary features (needed for a complete product, but not the core system design challenge):**
- Register / login / logout / password reset (auth)
- Subscribe to paid tiers for advanced features (Stripe)
- Export all data / delete account (GDPR compliance)
- Define custom metrics beyond the defaults
- Connect additional wearable providers later through cloud APIs, an aggregator, or more mobile integrations
- Receive alerts on anomalous values
- Receive live dashboard updates when new wearable data lands (WebSocket)

**Provider scope note:** The current foundation phase is manual-entry only. The MVP adds Samsung Health-originated sync on Android through the decided device-bridge flow: Samsung Health → Health Connect → Android app → backend. Health Connect is the connection provider; Samsung Health is sample provenance. Aggregator-backed providers such as Garmin, Fitbit, Oura, and Withings are full-requirements work, not MVP.

### 1.3 Non-Functional Requirements

**CAP Theorem: Consistency over Availability.**

Health data must be accurate. If a user logs a metric, it must be persisted correctly every time — we cannot tolerate lost writes or stale reads that show incorrect health data. A brief period of unavailability (seconds during a deploy or failover) is acceptable. A user seeing wrong health data is not.

In practice: single PostgreSQL primary (strong consistency for writes), Redis cache with short TTLs for reads (tolerate slightly stale dashboard data for performance).

| # | Requirement | Target | Why it matters |
|---|---|---|---|
| 1 | **Low-latency analytics queries** | < 200ms p95 for 30-day metric range queries | Users interact with trends constantly — slow charts kill the experience. Drives the TimescaleDB choice. |
| 2 | **Data durability & security** | Zero data loss, field-level encryption for PII, OWASP Top 10 addressed | Health data is sensitive and irreplaceable. Losing it or leaking it destroys trust. |
| 3 | **Consistency for writes** | All metric writes are ACID-committed before returning success | A user logs their blood pressure — it must be there when they check. No eventual consistency for writes. |
| 4 | **GDPR compliance** | Full data export and account deletion without undue delay, within 30 days | Legal requirement for EU users. Must be designed in, not bolted on. |
| 5 | **Availability** | 99.5% uptime (pragmatic MVP) | Important but secondary to consistency. Brief downtime is tolerable; wrong data is not. |

**Capacity estimation**: Deferred. We're building a time-series health tracker — it's a write-moderate, read-heavy system with predictable load. We'll do targeted math if a specific design decision requires it (e.g., partition size, cache sizing).

### 1.4 Core Entities

**Rationale — how did we decide what to store?**

We derived entities from the functional requirements by asking: *"What data must exist for this feature to work?"*

| Entity | Exists because... | Key design decision |
|---|---|---|
| **User** | Every feature requires knowing *who*. Multi-tenant system — all data is scoped to a user. | PII encrypted at field level. Email stored as ciphertext plus `email_lookup_hash` (HMAC of normalized email) for uniqueness + login lookups. UUID PKs avoid exposing sequential IDs. |
| **MetricDefinition** | Users need to know *what* they can track. System needs validation rules (unit, min/max range) per metric type. | Separated from MetricEntry to avoid duplicating metadata on every data point. `user_id=NULL` for system defaults, FK to user for custom metrics. |
| **MetricEntry** | Core requirement #1 — the actual data points users log. This is where 99% of storage and query load lives. | TimescaleDB hypertable partitioned by `recorded_at` for efficient time-range queries. Denormalized `user_id` for fast row-level filtering. |
| **WearableConnection** | Core requirement #3 — represents a linked sync source and its state. | Stores provider, `connection_mode`, platform, `source_app`, optional aggregator identifiers, status, and sync timestamps. MVP uses Android device-bridge sync for Samsung Health. We do not store raw Samsung/Health Connect tokens in the backend. |
| **Subscription** | Paid tiers gate features (custom metrics, integrations, streaming). Stripe state must be tracked server-side. | Single source of truth for entitlements. Decoupled from User to cleanly track subscription lifecycle (trialing → active → cancelled → past_due). |
| **AuditLog** | GDPR compliance requires knowing who changed what and when. Also useful for debugging and security forensics. | Append-only. Stores diffs (`jsonb changes`), not full snapshots. |

**Relationships & Cardinalities:**

| Relationship | Cardinality | Meaning |
|---|---|---|
| User → MetricEntry | **1 : M** | A user logs many data points. An entry belongs to exactly one user. |
| User → WearableConnection | **1 : M** | A user links multiple sync sources over time. Each connection belongs to one user. |
| User → Subscription | **1 : M** | A user has subscription history (trialing → active → cancelled). Typically one active at a time, but we keep history. |
| User → MetricDefinition | **1 : M** | A user can create custom metrics. System defaults have `user_id=NULL` (shared across all users). |
| User → AuditLog | **1 : M** | A user generates many audit entries. Append-only, never updated. |
| MetricDefinition → MetricEntry | **1 : M** | Each entry is "of" exactly one metric type (e.g., every heart rate reading points to the "Resting Heart Rate" definition). |
| WearableConnection → MetricEntry | **1 : M** (optional) | Entries *can* be sourced from a linked provider connection (`source_connection_id` is nullable). Manual entries have no source connection. |

> The `MetricDefinition → MetricEntry` split is the most important design choice: separating *what a metric is* (definition) from *each recorded value* (entry) gives us clean normalization, per-metric validation rules, and the ability to add custom metrics without schema changes. The second key choice is making `WearableConnection` support both device-bridge sync (Samsung MVP) and future aggregator/cloud integrations without changing the rest of the data model.

### 1.6 Delivery Phases

| Foundation (R1) | Samsung-sync MVP (R3) | Later (R4+) |
|---|---|---|
| Register / login / logout | Android companion app login + sync setup | OAuth social login (Google, Apple) |
| Manual metric logging (default metrics) | Samsung Health sync on Android | Custom metric definitions |
| Dashboard with latest values + 7/30-day trends | Sync status, replay, and error handling | Advanced analytics (percentiles, anomaly detection) |
| Basic CI/CD + Docker | Productionized sync ingestion + repair jobs | Password reset, GDPR export/delete, audit logging |
| | Real Samsung-originated data visible in dashboard | Stripe subscriptions, additional providers, premium API access, WebSocket streaming |

### 1.7 API Design

**Protocol: REST.** Standard CRUD operations over HTTP, resources map directly to our entities. No reason to use GraphQL (we don't have complex nested queries or multiple client types with different data needs) or gRPC (no microservices, no internal service-to-service calls). REST is well-understood, has great Django/DRF tooling, and covers 100% of our use cases.

**Versioning:** URL-based (`/api/v1/`). Explicit, easy to test, easy to route.

**Auth:** All endpoints except register/login require a valid JWT in the `Authorization: Bearer <token>` header. Rate limiting applied at the auth layer (5 login attempts/min, 3 password resets/hour).

#### Auth (public — no JWT required)
| Method | Endpoint | Description | Notes |
|---|---|---|---|
| POST | `/api/auth/register/` | User registration | Returns `201`; creates the user and active Free subscription atomically |
| GET | `/api/auth/csrf/` | Web CSRF bootstrap | Issues the CSRF cookie used by cookie-authenticated refresh/logout requests |
| POST | `/api/auth/web/login/` | Web login | Returns access token JSON and stores refresh token in an `HttpOnly` cookie |
| POST | `/api/auth/web/refresh/` | Web refresh | Cookie-only and CSRF-protected |
| POST | `/api/auth/web/logout/` | Web logout | Cookie-only, CSRF-protected, and blacklists the refresh token |
| POST | `/api/auth/mobile/login/` | Mobile login | Returns access and refresh tokens in JSON |
| POST | `/api/auth/mobile/refresh/` | Mobile refresh | Accepts refresh token explicitly in request JSON |
| POST | `/api/auth/mobile/logout/` | Mobile logout | Accepts and blacklists the refresh token supplied in request JSON |
| POST | `/api/auth/password/reset/` | Password reset email | Planned; rate limited |
| POST | `/api/auth/password/confirm/` | Confirm password reset | Planned |

#### User & Profile (JWT required)
| Method | Endpoint | Description | Notes |
|---|---|---|---|
| GET | `/api/v1/me/` | Current user profile | |
| PATCH | `/api/v1/me/` | Update profile (partial) | PATCH not PUT — only send fields to change |
| GET | `/api/v1/me/export/` | GDPR data export | Returns 202 Accepted, async job |
| DELETE | `/api/v1/me/` | GDPR account deletion | Idempotent — repeated calls return 204 |

#### Metrics (JWT required)
| Method | Endpoint | Description | Notes |
|---|---|---|---|
| GET | `/api/v1/metrics/definitions/` | List available metrics | Includes defaults + user's custom ones |
| POST | `/api/v1/metrics/definitions/` | Create custom metric (R5+) | |
| GET | `/api/v1/metrics/entries/?metric=resting_hr&from=2026-01-01&to=2026-03-01` | Query entries | Cursor-based pagination. Path params not needed — all filters are optional |
| POST | `/api/v1/metrics/entries/` | Log a metric entry | Not idempotent — repeated calls create duplicate entries |
| POST | `/api/v1/metrics/entries/bulk/` | Bulk import | |
| GET | `/api/v1/metrics/analytics/{slug}/?range=30d` | Analytics for one metric | `slug` is required (path param), `range` is optional (query param, default 30d) |

**Pagination (cursor-based for entries):**
```json
GET /api/v1/metrics/entries/?metric=resting_hr&limit=20

{
  "results": [
    {"id": 984312, "value": 58, "recorded_at": "2026-03-05T07:15:00Z", "source": "samsung_health"},
    ...
  ],
  "next_cursor": "eyJyZWNvcmRlZF9hdCI6ICIyMDI2LTAzLTA1VDA3OjE1OjAwWiIsICJpZCI6IDk4NDMxMn0=",
  "has_more": true
}

// Next page:
GET /api/v1/metrics/entries/?metric=resting_hr&cursor=eyJyZWNvcmRlZF9hdCI6ICIyMDI2LTAzLTA1VDA3OjE1OjAwWiIsICJpZCI6IDk4NDMxMn0=&limit=20
```
Cursor-based (not offset-based) because metric entries are time-series data — new entries are constantly added, and offset pagination would cause duplicates/gaps. Results are ordered by `recorded_at DESC, id DESC`, and the cursor encodes both values so backfills and out-of-order inserts don't skip or duplicate rows.

**Data passing convention:**
- **Path params** → required resource identifiers (`/analytics/{slug}/`, `/wearables/connections/{id}/`)
- **Query params** → optional filters and modifiers (`?metric=resting_hr&from=2026-01-01&range=30d&limit=20`)
- **Request body** → data payloads for creating/updating resources

**Example: Logging a metric entry**
```json
POST /api/v1/metrics/entries/
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...

{
  "metric_definition": "resting_hr",
  "value": 58,
  "recorded_at": "2026-03-05T07:15:00Z",
  "context": {"notes": "morning measurement"}
}

// Response: 201 Created
{
  "id": 984312,
  "metric_definition": "resting_hr",
  "value": 58,
  "recorded_at": "2026-03-05T07:15:00Z",
  "source": "manual",
  "context": {"notes": "morning measurement"},
  "created_at": "2026-03-05T07:15:02Z"
}
```

#### Subscriptions (R4+, JWT required)
| Method | Endpoint | Description | Notes |
|---|---|---|---|
| GET | `/api/v1/subscriptions/plans/` | Available plans | Public-ish — could be unauthenticated |
| POST | `/api/v1/subscriptions/checkout/` | Create Stripe Checkout session | Returns redirect URL, idempotent per session |
| POST | `/api/v1/subscriptions/portal/` | Create Stripe Customer Portal session | JWT required; returns a short-lived hosted portal URL |
| POST | `/api/v1/subscriptions/stripe/webhook/` | Stripe webhook receiver | No JWT — uses Stripe signature verification instead |

#### Samsung / Wearables (R2 internal spike, R3 MVP, JWT required)
| Method | Endpoint | Description | Notes |
|---|---|---|---|
| GET | `/api/v1/wearables/connections/` | List linked sync connections | Implemented; JWT required; returns only active connections owned by the caller |
| POST | `/api/v1/wearables/connections/` | Register or reactivate a wearable connection | Implemented; accepts only `provider=health_connect`; ownership, activation, and status are server-managed; enforces the current plan limit |
| GET | `/api/v1/wearables/connections/{id}/status/` | Fetch sync state for one connection | Implemented; JWT required and owner-scoped; includes provider, status, last sync timestamp, and last error; unowned or unknown UUIDs return `404` |
| POST | `/api/v1/wearables/uploads/` | Process a normalized wearable batch | Implemented synchronously; JWT required; accepts `connection_id`, `upload_id`, and `1–100` normalized entries; resolves an active caller-owned connection; returns `201` for new work, `200` for an exact retry, `409` for upload/record conflicts, and `400` for invalid input |
| DELETE | `/api/v1/wearables/connections/{id}/` | Disconnect provider | Implemented; JWT required; marks only a caller-owned active row inactive and releases its plan slot while preserving history; returns `204` when disconnected and `404` for unknown, unowned, or already-inactive rows |
| POST | `/api/v1/wearables/connections/{id}/resync/` | Request replay / resync from the client | Returns 202 Accepted — backend records replay intent and the Android client performs the upload |

MVP Samsung sync does **not** use provider webhooks or a hosted provider link flow. The Android companion app reads Samsung-originated data on device, uploads batches to our API, and the backend handles validation, deduplication, and persistence. A future aggregator webhook receiver can be added later for providers with cloud-friendly APIs.

**Implemented synchronous normalized upload example**
```http
POST /api/v1/wearables/uploads/
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
Content-Type: application/json
```

```json
{
  "connection_id": "7df7e4ab-7e6f-4558-b9be-17c824fbf54e",
  "upload_id": "9ea2c91d-63f4-40eb-a6bb-7fbd90c12a34",
  "entries": [
    {
      "metric_definition": "body_weight",
      "value": 78.4,
      "recorded_at": "2026-07-29T08:00:00Z",
      "source": "samsung_health",
      "external_source_id": "health_connect:WeightRecord:record-123"
    }
  ]
}
```

```json
{
  "id": "6ac744c4-8202-4cd7-91c7-3d44ea067381",
  "connection_id": "7df7e4ab-7e6f-4558-b9be-17c824fbf54e",
  "upload_id": "9ea2c91d-63f4-40eb-a6bb-7fbd90c12a34",
  "status": "succeeded",
  "entries_imported": 1,
  "entries_skipped": 0
}
```

#### Real-Time Streaming (R5+)
```
ws://host/ws/metrics/stream/
```
Not REST — persistent WebSocket connection. Ticket-based auth (short-lived token from REST endpoint, included in WS handshake). Used for live dashboard updates when new manual or wearable data lands; not for direct device-to-server streaming in MVP.

### 1.8 Data Flow

```mermaid
sequenceDiagram
    participant U as User
    participant A as Android App
    participant H as Samsung Health / Health Connect
    participant API as Django API
    participant DB as TimescaleDB
    participant R as Redis
    participant C as Celery Worker

    Note over U,C: Manual Metric Logging
    U->>API: POST /metrics/entries/ (JWT)
    API->>API: Validate input, check permissions
    API->>DB: INSERT metric_entry
    API->>R: Invalidate dashboard cache
    API-->>U: 201 Created

    Note over U,C: Samsung Sync (Client Pull + Upload)
    U->>A: Open companion app, grant permissions
    H-->>A: Samsung-originated health records on device
    A->>API: POST /wearables/uploads/ (JWT + upload_id)
    API->>API: Validate connection + idempotency
    API->>C: Enqueue normalization job
    C->>C: Deduplicate, normalize units + timestamps
    C->>DB: Bulk insert metric_entries
    C->>DB: Update sync cursor + connection status
    C->>R: Invalidate user cache
    API-->>A: 202 Accepted
    A->>API: GET /wearables/connections/{id}/status/ (JWT)
    API-->>A: Last sync timestamp + status

    Note over U,C: Dashboard Load
    U->>API: GET /metrics/analytics/ (JWT)
    API->>R: Check cache
    alt Cache hit
        R-->>API: Cached analytics
    else Cache miss
        API->>DB: time_bucket() aggregation query
        API->>R: Store in cache (10 min TTL)
    end
    API-->>U: Analytics JSON
```

### 1.9 High-Level Design

> [!IMPORTANT]
> **Strategy: Develop locally with Docker Compose. Deploy MVP to cloud with pragmatic architecture.** Don't start with the absolute simplest diagram, but don't over-engineer either. Include key best practices (reverse proxy, backups, secrets management, CI/CD) but defer full HA and advanced scaling until needed.

#### Local Development Architecture
This diagram now has a maintained, current counterpart in
`reference_docs/knowledge/05-local-development-architecture.md` and the
Structurizr source of truth. The local runtime includes the browser/backend
loop plus Android Studio/Gradle/adb installing and testing the Compose client
on a physical phone.

The Android shell and login UI exist, while Android-to-Django authentication
and Health Connect reads remain the next device-bridge steps.

```mermaid
graph TB
    subgraph "Your Machine - Docker Compose"
        DEV["Django Dev Server<br/>:8000"]
        PG[("PostgreSQL + TimescaleDB<br/>:5432")]
        REDIS[("Redis<br/>:6379")]
        CELERY["Celery Worker"]
        BEAT["Celery Beat"]
    end

    DEV --> PG
    DEV --> REDIS
    CELERY --> PG
    CELERY --> REDIS
    BEAT --> REDIS
```

**Scope notes**
- This is the local backend runtime, not the full Samsung-sync development environment.
- In the Samsung-sync MVP, data is uploaded from an Android companion app; the backend does not call a Samsung cloud API directly.
- When R2/R3 work begins, document the Android emulator/device setup separately instead of overloading this diagram.

#### Pragmatic MVP Cloud Architecture (Target)
```mermaid
graph TB
    subgraph "Internet"
        WEB["Web Users / Browsers"]
    end

    subgraph "User Device"
        SH["Samsung Health"]
        HC["Health Connect"]
        ANDROID["Android Companion App"]
    end

    subgraph "App Hosting - AWS"
        subgraph "Edge"
            GW["ALB"]
        end

        subgraph "Compute"
            APP["Django App<br/>(ECS Fargate Service)"]
            WORKER["Celery Worker<br/>(ECS Task)"]
            BEAT["Celery Beat<br/>(ECS Task)"]
        end

        subgraph "App Data"
            ELASTICACHE[("ElastiCache Redis")]
            S3["S3 Bucket<br/>(Backups, Static)"]
        end

        subgraph "Security & Config"
            SECRETS["Secrets Manager"]
            IAM["IAM Roles"]
        end

        subgraph "Ops"
            CW["CloudWatch<br/>(Logs + Metrics)"]
        end
    end

    subgraph "Managed Database"
        TSDB[("Timescale Cloud<br/>(Managed PostgreSQL + TimescaleDB)")]
    end

    subgraph "CI/CD"
        GHA["GitHub Actions"]
        ECR["ECR<br/>(Container Registry)"]
    end

    WEB --> GW --> APP
    SH --> HC --> ANDROID
    ANDROID --> GW
    APP --> TSDB
    APP --> ELASTICACHE
    APP --> SECRETS
    WORKER --> TSDB
    WORKER --> ELASTICACHE
    BEAT --> ELASTICACHE
    GHA --> ECR --> APP
    APP --> CW
```

**MVP notes**
- Samsung sync is client-initiated: Samsung Health data is read on device, then uploaded by the Android companion app.
- No Samsung cloud webhook or provider-hosted link flow is assumed in MVP.
- Celery handles ingestion normalization, deduplication, retries, and repair tasks after uploads hit Django.

#### Full Requirements Architecture (Target — All Features)

This is the architecture when all releases (R1–R5) are complete: auth, metrics, subscriptions, wearable integrations, real-time streaming, analytics — everything running in production.

```mermaid
graph TB
    subgraph "Client Layer"
        WEB["React SPA<br/>(Vite)"]
        MOBILE["Mobile Companion Apps<br/>(Android first, iOS later)"]
    end

    subgraph "On-Device Health Data"
        STORES["Samsung Health / Health Connect / Apple Health"]
    end

    subgraph "Edge"
        NGINX["ALB<br/>(TLS, CORS, Rate Limiting)"]
    end

    subgraph "Application Layer"
        DJANGO["Django REST API<br/>(Gunicorn, WSGI)"]
        CHANNELS["Django Channels<br/>(Uvicorn, ASGI — WebSockets)"]
        CELERY["Celery Workers<br/>(Sync, Analytics, Webhooks)"]
        BEAT["Celery Beat<br/>(Scheduled Tasks)"]
    end

    subgraph "Data Layer"
        PG[("Timescale Cloud<br/>(PostgreSQL + TimescaleDB)")]
        REDIS[("Redis<br/>(Cache + Broker + Pub/Sub)")]
        S3["S3<br/>(Exports, Backups, Static)"]
    end

    subgraph "External Services"
        STRIPE["Stripe API<br/>(Checkout, Webhooks, Portal)"]
        AGG["Wearable Aggregator API<br/>(Link flow, webhooks, normalized payloads)"]
        PROVIDERS["Provider Cloud APIs<br/>(Garmin, Fitbit, Oura, Withings, others)"]
        SENTRY_EXT["Sentry<br/>(Error Tracking)"]
    end

    WEB -- "HTTPS" --> NGINX
    MOBILE -- "HTTPS" --> NGINX
    STORES --> MOBILE

    NGINX -- "REST" --> DJANGO
    NGINX -- "WebSocket" --> CHANNELS

    DJANGO --> PG
    DJANGO --> REDIS
    DJANGO --> STRIPE
    DJANGO --> AGG
    DJANGO --> SENTRY_EXT

    CHANNELS --> REDIS
    CHANNELS --> PG

    CELERY --> PG
    CELERY --> REDIS
    CELERY --> AGG
    CELERY --> S3

    BEAT --> REDIS

    STRIPE -- "Webhooks" --> DJANGO
    AGG -- "Webhooks" --> DJANGO
    AGG --> PROVIDERS
```

**How traffic flows:**
- **REST requests** (login, log metric, fetch analytics, sync status) → ALB → Django (Gunicorn/WSGI)
- **Device-bridge sync** (Samsung Health / Health Connect / Apple Health class sources) → mobile app reads on-device data → Django upload endpoint → Celery normalization + dedupe → PostgreSQL
- **WebSocket connections** (live dashboard updates) → ALB → Django Channels (Uvicorn/ASGI) → Redis Pub/Sub → connected dashboards
- **Background work** (wearable uploads, cloud-provider backfills, analytics computation, Stripe webhooks, GDPR exports) → Celery Workers ← Redis broker
- **Scheduled jobs** (nightly aggregates, token refresh) → Celery Beat → Redis → Workers
- **Cloud-provider integrations** → Celery Workers connect to the wearable aggregator + Stripe when the provider supports server-side APIs

#### Scaled Architecture (1M+ Users — For Reference)

When the MVP architecture can't keep up (single DB bottleneck, single app instance overloaded), you need horizontal scaling. Here's what that looks like:

```mermaid
graph TB
    subgraph "Internet"
        USERS["Millions of Users"]
    end

    subgraph "Edge Layer"
        CDN["CloudFront CDN<br/>(Static + API caching)"]
        WAF["AWS WAF<br/>(DDoS + Rate Limiting)"]
        ALB["Application Load Balancer<br/>(Round-robin)"]
    end

    subgraph "Compute - Auto-Scaled"
        APP1["Django Instance 1"]
        APP2["Django Instance 2"]
        APP3["Django Instance N..."]
        WS1["Channels Instance 1<br/>(WebSocket)"]
        WS2["Channels Instance 2"]
        W1["Celery Worker Pool<br/>(Auto-scaled ECS Tasks)"]
    end

    subgraph "Data - Sharded + Replicated"
        PG_PRIMARY[("PostgreSQL / Timescale Primary<br/>(Writes only)")]
        PG_READ1[("Read Replica 1")]
        PG_READ2[("Read Replica 2")]
        REDIS_CLUSTER[("ElastiCache Cluster<br/>(3-node, failover)")]
        S3["S3<br/>(Backups + Media)"]
    end

    subgraph "Observability"
        PROM["Prometheus"]
        GRAF["Grafana Dashboards"]
        SENTRY["Sentry"]
    end

    USERS --> CDN --> WAF --> ALB
    ALB --> APP1
    ALB --> APP2
    ALB --> APP3
    ALB --> WS1
    ALB --> WS2
    APP1 --> PG_PRIMARY
    APP2 --> PG_READ1
    APP3 --> PG_READ2
    WS1 --> REDIS_CLUSTER
    WS2 --> REDIS_CLUSTER
    W1 --> PG_PRIMARY
    W1 --> REDIS_CLUSTER
    PG_PRIMARY --> PG_READ1
    PG_PRIMARY --> PG_READ2
    APP1 --> PROM
    PROM --> GRAF
    APP1 --> SENTRY
```

**What changed from MVP → Scaled and why:**

| Component | MVP | Scaled | Why |
|---|---|---|---|
| **App servers** | 1 instance | N instances behind ALB | Single instance can't handle 10K+ concurrent requests. ALB distributes load round-robin. |
| **Database reads** | 1 primary (reads + writes) | Primary (writes) + 2 read replicas | Dashboard analytics queries are read-heavy. Replicas offload reads from the primary so writes don't slow down. |
| **Database writes** | Single primary | Still single primary | PostgreSQL doesn't support multi-primary writes. For writes beyond one primary, you'd need to shard by user_id (e.g., users A-M → shard 1, N-Z → shard 2). |
| **Redis** | Single instance | 3-node cluster with failover | Single Redis = single point of failure. Cluster gives replication + automatic failover. |
| **WebSockets** | Part of Django app | Separate Channels instances | WebSocket connections are long-lived and memory-heavy. Separating them lets you scale WS independently from REST API. |
| **Celery** | 1 worker | Auto-scaled worker pool | Wearable syncs and analytics jobs scale with user count. ECS auto-scales workers based on queue depth. |
| **CDN** | Optional | Required | At scale, serving static assets and caching API responses at the edge saves massive bandwidth and reduces latency globally. |
| **WAF** | Basic | Required | At 1M+ users, you're a target for DDoS, credential stuffing, and abuse. WAF filters malicious traffic before it reaches your servers. |
| **Monitoring** | CloudWatch + Sentry | Prometheus + Grafana + Sentry | CloudWatch is fine for MVP. At scale, Prometheus gives you custom metrics (requests/sec per endpoint, p99 latency, queue depths) and Grafana gives you dashboards to spot problems before users notice. |

> [!NOTE]
> **When to actually do this:** Not until you have clear evidence the MVP can't handle the load. Signs: p95 latency > 500ms, DB CPU > 70% sustained, connection pool exhaustion. Don't pre-optimize.

### 1.10 Deep Dives

#### Security (OWASP Top 10 addressed)
| OWASP Risk | Mitigation |
|---|---|
| A01 Broken Access Control | User-scoped querysets / service methods plus permission classes per view |
| A02 Cryptographic Failures | Argon2 passwords, field-level encryption for PII, TLS 1.3, no secrets in code |
| A03 Injection | Django ORM (parameterized queries), strict serializer validation |
| A04 Insecure Design | Threat modeling in this plan, rate limiting, audit logging |
| A05 Security Misconfiguration | CSP/HSTS/CORS headers, `DEBUG=False` in prod, secrets in Secrets Manager |
| A06 Vulnerable Components | Dependabot alerts, `pip-audit` in CI |
| A07 Auth Failures | JWT with short TTL (15 min), rate-limited login (5/min), refresh token rotation |
| A08 Data Integrity Failures | Stripe webhook signature verification, input validation with range checks |
| A09 Logging Failures | `django-auditlog` on all models, structured logging, CloudWatch |
| A10 SSRF | No user-supplied URLs in server-side requests, outbound calls restricted to allowlisted provider / aggregator hosts when cloud integrations are added |

#### Edge Cases
- **Duplicate data from wearable sync**: `MetricEntry.source_connection` preserves connection provenance, and PostgreSQL enforces a conditional unique constraint for non-null `(source_connection, external_source_id)` values. Update corrected provider records rather than inserting duplicates.
- **Timezone hell**: All timestamps stored as UTC (`timestamptz`). User's timezone stored on profile for display only. `recorded_at` is always UTC — the frontend converts for display.
- **Metric value out of range**: Rejected at serializer level. MetricDefinition has `min_value` and `max_value` — a heart rate of 500 bpm gets a 400 error.
- **Stripe webhook replay**: Idempotency key check. Store processed Stripe event IDs in a `StripeEvent` table. If we see the same event ID twice, skip processing.
- **Token expiry during WebSocket session**: Server sends `AUTH_EXPIRED` frame. Client must close the socket, re-authenticate via REST, get a new WS ticket, and reconnect.
- **User deletes account mid-sync**: Celery task checks `user.is_active` before writing data. If user is deleted, task aborts gracefully.
- **Concurrent provider-record writes**: The conditional `(source_connection, external_source_id)` unique constraint is the final race-safe guard against inserting one provider record twice. Application-level existence checks alone remain insufficient. Manual entries remain outside this constraint.
- **Android upload retry after network loss**: Uploads must be idempotent via `upload_id`. The client retries safely, and the server accepts out-of-order data (sorted by `recorded_at`, not arrival time).
- **Future aggregator webhook delivery failure**: Signed webhooks should retry, and a scheduled backfill job should repair missed intervals when cloud-based providers are added later.

#### Bottlenecks & Mitigations
| Bottleneck | Symptom | Mitigation |
|---|---|---|
| Dashboard analytics on millions of rows | Slow dashboard loads (> 1s) | TimescaleDB `time_bucket()` + pre-computed daily aggregates via nightly Celery task. Cache results in Redis (10 min TTL). |
| Single Postgres primary under write load | Connection pool exhaustion, write latency spikes | Read replicas for analytics queries. Only writes go to primary. Connection pooling via PgBouncer. |
| Redis as single point of failure | Cache miss storm, Celery stalls, WS drops | ElastiCache cluster with automatic failover. App degrades gracefully (skip cache, serve from DB). |
| Mobile upload bursts after offline periods | Large sync batches spike worker load | Queue uploads, process them asynchronously, and cap per-connection replay windows. |
| Third-party API rate limits (aggregator / provider APIs) | Sync jobs fail in bursts | Celery retry with exponential backoff + jitter. Per-user rate limiting on resync requests. Provider-level circuit breaker. This is mainly for post-MVP cloud integrations. |
| WebSocket connection memory (1000+ concurrent) | OOM on app instance | Token-bucket backpressure. Max 3 connections per user. Separate WS instances from REST API at scale. |
| Large GDPR export (user with 100K+ entries) | Request timeout | Async export via Celery. Return 202 Accepted + poll endpoint. Stream results to S3, send download link via email. |

### 1.11 ERD

```mermaid
erDiagram
    User ||--o{ Subscription : has
    User ||--o{ MetricDefinition : creates
    User ||--o{ MetricEntry : logs
    User ||--o{ WearableConnection : connects
    User ||--o{ AuditLog : generates
    MetricDefinition ||--o{ MetricEntry : "defines type for"
    WearableConnection ||--o{ MetricEntry : sources

    User {
        uuid id PK
        string email_ciphertext "encrypted"
        string email_lookup_hash "unique, indexed"
        string password_hash "argon2"
        string first_name "encrypted"
        string last_name "encrypted"
        date date_of_birth "encrypted"
        string timezone
        datetime created_at
        datetime updated_at
        boolean is_active
    }

    Subscription {
        uuid id PK
        uuid user_id FK
        string stripe_customer_id
        string stripe_subscription_id
        string status "active|cancelled|past_due|trialing"
        string plan "free|pro|premium"
        datetime current_period_start
        datetime current_period_end
        datetime created_at
    }

    MetricDefinition {
        uuid id PK
        uuid user_id FK "null for defaults"
        string name
        string slug
        string unit
        string category "cardiovascular|respiratory|body_composition|recovery|activity|biomarker|custom"
        float min_value
        float max_value
        boolean is_default
        boolean is_active
        jsonb metadata
    }

    MetricEntry {
        bigint id PK
        uuid user_id FK
        uuid metric_definition_id FK
        float value
        timestamptz recorded_at "hypertable partition key"
        uuid source_connection_id FK "nullable"
        string source "manual|samsung_health|garmin|fitbit|oura|withings|csv_import"
        string external_source_id "nullable, stable dedupe key"
        jsonb context
        timestamptz created_at
    }

    WearableConnection {
        uuid id PK
        uuid user_id FK
        string provider "samsung_health|garmin|fitbit|oura|withings"
        string connection_mode "device_bridge|aggregator|direct_cloud"
        string platform "android|ios|server"
        string source_app "health_connect|samsung_health|aggregator"
        string aggregator_connection_id "nullable, unique"
        string provider_user_id_hash "nullable"
        string status "pending|active|error|revoked"
        datetime last_synced_at
        datetime last_uploaded_at
        datetime last_webhook_at
        string sync_cursor "nullable, opaque"
        string last_error_code "nullable"
        boolean is_active
    }

    AuditLog {
        bigint id PK
        uuid user_id FK
        string action
        string model_name
        string object_id
        jsonb changes
        string ip_address
        timestamptz created_at
    }
```

### 1.12 Wireframes & Design

**Design philosophy:** Dark, clinical, premium. "Whoop meets Linear."

**Inspiration**: Whoop (metric cards), Oura Ring (data viz), Linear (dark UI), Arc Browser (glassmorphism)

**Dashboard wireframe:**
```
┌─────────────────────────────────────────────────────┐
│  🌙 Longevity                    [Profile] [⚙️]    │
├─────────────────────────────────────────────────────┤
│                                                     │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌────────┐│
│  │ 💚 58   │  │ 💙 42.5 │  │ 💛 7.5h │  │ 🔴 118││
│  │ bpm     │  │ ml/kg   │  │ sleep   │  │ mmHg   ││
│  │ Rest HR │  │ VO2 Max │  │ Duration│  │ BP Sys ││
│  │ ▼2 ↓    │  │ ▲1.5 ↑  │  │ ═ same  │  │ ▲3 ↑  ││
│  └─────────┘  └─────────┘  └─────────┘  └────────┘│
│                                                     │
│  ┌──── Heart Rate Trend (30 days) ────────────────┐ │
│  │         ╭──╮                                    │ │
│  │  ──────╯    ╰──────╮  ╭────╮                   │ │
│  │                     ╰──╯    ╰──────────         │ │
│  │  60 ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ avg     │ │
│  └─────────────────────────────────────────────────┘ │
│                                                     │
│  Recent Entries                        [+ Log]      │
│  VO2 Max      42.5 ml/kg/min   manual   5 Mar     │
│  Rest HR      58 bpm     samsung health   5 Mar   │
└─────────────────────────────────────────────────────┘
```

**Color tokens**: `--bg-primary: #0A0A0F`, `--bg-card: #12121A`, `--accent-teal: #00D4AA`, `--accent-red: #FF4D6A`, `--accent-amber: #FFB84D`

**Typography**: Inter (headings) + JetBrains Mono (metric values)

### 1.13 Tech Stack

| Layer | Choice | Why |
|---|---|---|
| **Backend** | Python / Django + DRF | Know it well, batteries-included, great ORM |
| **Database** | Timescale Cloud (PostgreSQL + TimescaleDB) | Keeps TimescaleDB features without relying on unsupported RDS extensions |
| **Cache / Broker** | Redis | Cache + Celery broker + Channels pub/sub in one |
| **Task Queue** | Celery + Celery Beat | Mature, Django-native, handles scheduled + async tasks |
| **WebSockets** | Django Channels | Stays in Django ecosystem, ASGI support |
| **Web Frontend** | React (Vite) | Fast, huge ecosystem, Recharts for data viz |
| **Mobile** | Kotlin Android app | Required for Samsung-sync MVP because Samsung data is read on device |
| **On-Device Health Access** | Health Connect (preferred) / Samsung Health Data SDK if required | Health Connect reduces Samsung-specific coupling; direct Samsung SDK is a fallback for metrics not exposed through Health Connect |
| **Payments** | Stripe | Best docs, Checkout + Customer Portal = minimal frontend work |
| **Auth** | djangorestframework-simplejwt | JWT, stays in DRF ecosystem |
| **Containerization** | Docker + Docker Compose | Local dev parity, easy cloud deployment |
| **CI/CD** | GitHub Actions | Free for public repos, simple YAML config |
| **IaC** | Terraform | Cloud-agnostic, version-controlled infrastructure |
| **Cloud** | AWS (ECS Fargate, ElastiCache, S3) + Timescale Cloud | Pragmatic split: AWS for app hosting, managed Timescale for time-series DB |
| **Monitoring** | CloudWatch (MVP) → Prometheus + Grafana (later) | Start simple, upgrade when needed |
| **Error Tracking** | Sentry | Free tier, Django integration, best-in-class |

### 1.14 Success Metrics / KPIs

| KPI | Target | How to measure |
|---|---|---|
| Foundation release shipped | Within 6 weeks | Deployed, functional, passing tests |
| Samsung-sync MVP shipped | Within 12 weeks | Deployed, sync works on Android, passing tests |
| API p95 latency | < 300ms | Sentry performance monitoring |
| Test coverage | > 80% | `pytest-cov` in CI |
| Zero critical security findings | 0 P0/P1 | `pip-audit` + manual OWASP review |
| Beta users actively logging | 5+ for 2+ weeks | DB query on active users |
| CI/CD pipeline green | 100% on main | GitHub Actions dashboard |
| Uptime (production) | 99.5% | UptimeRobot or CloudWatch |

---

## 2. Architecture & Design

### 2.1 Monolith vs Microservices

**Decision: Django Monolith.**

| | Monolith | Microservices |
|---|---|---|
| Complexity | Low — one repo, one deploy | High — service discovery, inter-service communication |
| Solo developer | ✅ Manageable | ❌ Operational overhead kills velocity |
| Deployment | One container | Multiple containers + orchestration |
| Data consistency | Transactions are trivial | Distributed transactions, eventual consistency |
| When to switch | When a specific module needs independent scaling | Not before 50K+ users and a team |

### 2.2 Database Design

See §1.11 for full ERD. Key decisions:
- `MetricEntry` = TimescaleDB hypertable, partitioned by `recorded_at`
- UUIDs for all PKs (no sequential ID exposure)
- PII encrypted at field level; email lookup via `email_lookup_hash`
- `Subscription` is the single source of truth for entitlements

#### What is `recorded_at`?

`recorded_at` is a **field on our MetricEntry entity** — it's the timestamp of *when the health measurement was taken* (not when it was inserted into the DB; that's `created_at`). It's a `timestamptz` column in PostgreSQL, stored as UTC.

TimescaleDB uses `recorded_at` as the **hypertable partition key** — meaning it automatically splits the `metric_entries` table into time-based chunks behind the scenes (e.g., one chunk per week). This makes time-range queries ("give me all heart rate entries from the last 30 days") dramatically faster because Postgres only scans the relevant chunks, not the entire table.

`recorded_at` is *our* field. TimescaleDB just uses it for partitioning.

#### Why MetricDefinition AND MetricEntry? (Not just normalization)

You could put everything in one table: `{user_id, metric_name, unit, min, max, value, timestamp}`. But that would mean:
- Every single data point repeats the name, unit, min/max — wasting storage across millions of rows
- Changing a metric's validation range means updating millions of rows
- Custom metrics require schema changes or magic strings

Splitting into MetricDefinition (the *template*) + MetricEntry (the *data*) gives us:
1. **Storage efficiency**: MetricEntry is lean — just `value`, `recorded_at`, and FKs
2. **Validation rules in one place**: Change min/max on the definition, applies to all future entries
3. **Custom metrics without schema changes**: Just `INSERT` a new MetricDefinition row
4. **Queryability**: "Get all cardiovascular metrics" = join on definition's category

#### What does "MetricEntry sources WearableConnection" mean?

The `source_connection_id` FK on MetricEntry answers: **"Where did this data point come from?"**

- A manual entry (user typed it in): `source_connection_id = NULL`, `source = 'manual'`
- An auto-synced entry from Samsung Health on Android: `source_connection_id = 'uuid-of-samsung-connection'`, `source = 'samsung_health'`

This lets us show provenance ("this reading came from Samsung Health through your Health Connect connection"), filter by source app, and detect duplicates across sync jobs. If Health Connect or the Android client can supply a stable source identifier, we store that in `external_source_id` for stronger idempotency.

#### Sample Data Across All Tables

**Users:**
| id | email_lookup_hash | email_ciphertext | first_name | timezone | is_active |
|---|---|---|---|---|---|
| `a1b2c3d4-...` | `hmac(alice@example.com)` | `alice@enc...` | `Alice (enc)` | `Europe/Berlin` | true |
| `e5f6g7h8-...` | `hmac(bob@example.com)` | `bob@enc...` | `Bob (enc)` | `America/New_York` | true |

**MetricDefinitions (system defaults, `user_id = NULL`):**
| id | user_id | name | slug | unit | category | min | max | is_default |
|---|---|---|---|---|---|---|---|---|
| `def-001` | NULL | Resting Heart Rate | `resting_hr` | bpm | cardiovascular | 30 | 220 | true |
| `def-002` | NULL | VO2 Max | `vo2_max` | ml/kg/min | cardiovascular | 10 | 90 | true |
| `def-003` | NULL | Sleep Duration | `sleep_duration` | hours | recovery | 0 | 24 | true |
| `def-004` | NULL | Body Weight | `body_weight` | kg | body_composition | 20 | 400 | true |
| `def-005` | NULL | Blood Pressure (Systolic) | `bp_systolic` | mmHg | cardiovascular | 60 | 250 | true |
| `def-custom` | `a1b2c3d4-...` | Cold Plunge Duration | `cold_plunge` | minutes | recovery | 0 | 60 | false |

**WearableConnections:**
| id | user_id | provider | connection_mode | source_app | last_synced_at | is_active |
|---|---|---|---|---|---|---|
| `conn-001` | `a1b2c3d4-...` | samsung_health | device_bridge | health_connect | 2026-03-06 07:00 UTC | true |
| `conn-002` | `e5f6g7h8-...` | oura | aggregator | aggregator | 2026-03-05 22:30 UTC | true |

**MetricEntries (the actual data points):**
| id | user_id | metric_definition_id | value | recorded_at | source_connection_id | source | external_source_id |
|---|---|---|---|---|---|---|---|
| 1 | `a1b2c3d4-...` | `def-001` (Resting HR) | 58 | 2026-03-06 07:15 UTC | `conn-001` | samsung_health | `samsung:heart_rate:1741245300` |
| 2 | `a1b2c3d4-...` | `def-002` (VO2 Max) | 42.5 | 2026-03-06 08:30 UTC | NULL | manual | NULL |
| 3 | `a1b2c3d4-...` | `def-003` (Sleep) | 7.5 | 2026-03-06 06:30 UTC | `conn-001` | samsung_health | `samsung:sleep:1741242600` |
| 4 | `a1b2c3d4-...` | `def-custom` (Cold Plunge) | 3.5 | 2026-03-06 09:00 UTC | NULL | manual | NULL |
| 5 | `e5f6g7h8-...` | `def-001` (Resting HR) | 65 | 2026-03-05 22:00 UTC | `conn-002` | oura | `agg:oura:resting_hr:1741212000` |

Notice row 1: Alice's resting HR of 58 bpm was *auto-synced* from Samsung Health through her Health Connect connection (`source_connection_id = conn-001`). Row 2: her VO2 Max was *manually entered* (`source_connection_id = NULL`). Row 4: her custom "Cold Plunge" metric uses a definition she created herself.

**Subscriptions:**
| id | user_id | plan | status | current_period_end |
|---|---|---|---|---|
| `sub-001` | `a1b2c3d4-...` | pro | active | 2026-04-06 |
| `sub-002` | `e5f6g7h8-...` | free | active | NULL |

**AuditLog:**
| id | user_id | action | model_name | changes |
|---|---|---|---|---|
| 1 | `a1b2c3d4-...` | create | MetricEntry | `{"value": 42.5, "metric": "vo2_max"}` |
| 2 | `a1b2c3d4-...` | update | User | `{"timezone": ["UTC", "Europe/Berlin"]}` |

### 2.3 API Contracts
See §1.7. REST with DRF. OpenAPI spec auto-generated via `drf-spectacular`.

### 2.4 Auth Strategy
- **JWT** (short-lived access 15 min + HTTP-only refresh 7 days)
- **Email storage** = encrypted ciphertext + `email_lookup_hash` for uniqueness / lookup
- **OAuth social login** (Google, Apple) after MVP
- **Samsung sync auth** = Android companion app uses our JWT and asks for Samsung Health / Health Connect permissions on device
- **Future cloud-provider sync auth** = hosted link flow + signed webhooks through an aggregator or direct provider OAuth where appropriate
- **Rate limiting** on auth endpoints (5 login attempts/min)

### 2.5 Scalability Approach
- Start vertical (bigger server) — Django monolith handles it
- TimescaleDB compression for older data (automatic, configured per hypertable)
- Redis caching for hot paths (dashboard analytics)
- Celery workers scale horizontally (add more ECS tasks)
- When needed: read replicas for DB, CDN for static assets

### 2.6 Security (OWASP Top 10)
See §1.10 Deep Dives.

### 2.7 Implementation Strategy

#### The 4-Architecture Progression

The plan contains 4 architectures. They're not separate systems — they're stages of the same system growing:

```
1. Local Dev           →  2. MVP Cloud          →  3. Full Requirements    →  4. Scaled (1M+)
(Docker Compose)          (Single-instance         (Hybrid integrations,     (Read replicas,
                           cloud deploy)            all features)             auto-scaling,
You code here.            R1 foundation and        R1–R5 complete.           CDN, WAF)
Never changes.            R3 MVP deploy here.      This is the goal.         Only if needed.
```

**Your ultimate target is #3 — Full Requirements Architecture.** #4 is for reference / interviews / if you get massive traction.

**Key insight: #2 evolves into #3 naturally.** You don't "migrate" — you add components to the same cloud infrastructure as you ship each release:
- **R1**: Django + Timescale + Redis on cloud → manual-entry foundation on **architecture #2**
- **R2**: Add Android companion prototype + ingest endpoints → same infra, just new clients and sync code
- **R3**: Add Samsung sync UX, background uploads, and repair jobs → same infra, add more Celery capacity
- **R4**: Add Stripe webhook endpoint → same infra, just new code
- **R5**: Add Django Channels and richer analytics → same infra, add ASGI routing and more caching
- **End result: architecture #3 — without ever "migrating"**

#### Vertical Slice Implementation

Build features end-to-end (model → serializer → view → test → deploy), not layer-by-layer.

| Horizontal (❌ don't do this) | Vertical (✅ do this) |
|---|---|
| Week 1: Build ALL models | Week 1: Build auth end-to-end |
| Week 2: Build ALL serializers | Week 2: Build metric logging end-to-end |
| Week 3: Build ALL views | Week 3: Build dashboard analytics end-to-end |
| Week 4: Try to connect everything | Each week delivers a working, tested, deployed feature |

**R1 foundation vertical slices (~3-5 days each):**

| Slice | What you build | Shippable result |
|---|---|---|
| **1. Scaffold** | Django project, Docker Compose, CI pipeline, deploy pipeline | Empty app deployed to cloud, CI runs on push |
| **2. Auth** | User model, encrypted PII, `email_lookup_hash`, register, login, refresh, logout, rate limiting | Users can create accounts and log in |
| **3. Metric definitions** | MetricDefinition model, seed data migration, list endpoint | API returns available metrics |
| **4. Metric logging** | MetricEntry model, TimescaleDB hypertable, create/list/filter endpoints | Users can log and retrieve metrics |
| **5. Analytics** | time_bucket queries, analytics endpoint, Redis caching | Users can see 7/30-day trends |
| **6. Deploy + Monitoring** | Health check, structured logging, CI/CD deploy, basic monitoring | Working manual-entry foundation deployed to cloud |
| **7. Docs + Hardening** | Error handling, API docs, security headers, test coverage hardening | Production-ready foundation release |

Each slice: code → test → PR → CI green → merge → deploy.

**R1.1 hardening:** Password reset, GDPR export/delete, and audit logging. Important, but not required to prove the manual-entry foundation loop.

**R2 / R3 Samsung slices:**
- **R2 spike**: prove `Samsung Health -> Health Connect/direct SDK -> Android app -> backend` with JWT auth, one upload endpoint, and a small set of core metrics.
- **R3 MVP**: productionize the spike with connection UX, sync status, replay support, background sync, retries, and user-facing error handling.

The manual-entry foundation is a real release, but the public MVP promise is not complete until R3 Samsung sync works end-to-end.

#### Tech Learning Timeline

You don't need to learn everything before starting. Learn each tech right before the slice that needs it:

| Phase | Tech to learn | Estimated ramp-up |
|---|---|---|
| **Before Slice 1** | Docker Compose, GitHub Actions CI, Terraform basics | 1-2 days |
| **Slices 2-7 (R1)** | Django + DRF, PostgreSQL + TimescaleDB, pytest, Redis (cache), JWT auth | Core skills — should already know Django/DRF |
| **R2 (Samsung spike)** | Kotlin/Android, Health Connect, mobile JWT auth, upload idempotency | 2-4 days |
| **R3 (Samsung MVP)** | Android background sync, retries, reconciliation, connection UX | 2-4 days |
| **R4 (Monetization)** | Stripe API (Checkout, webhooks), Celery basics | 1-2 days |
| **R5 (Real-Time + Advanced)** | Django Channels, WebSocket protocol, Redis Pub/Sub, advanced caching/analytics | 2-4 days |

---

## 3. Development Environment Setup

### 3.1 Version Control
```bash
git init
# GitHub repo with branch protection on main
# PRs required, CI must pass before merge
```

### 3.2 Docker Compose
**Current scope:** Docker Compose covers the backend runtime. The implemented
Android companion project is built separately with Android Studio/Gradle and
installed/tested on a physical phone through `adb`.

```yaml
# docker-compose.yml (simplified)
services:
  web:
    build: .
    ports: ["8000:8000"]
    env_file: .env
    depends_on: [db, redis]

  db:
    image: timescale/timescaledb:latest-pg16
    ports: ["5432:5432"]
    volumes: [pgdata:/var/lib/postgresql/data]
    environment:
      POSTGRES_DB: longevity
      POSTGRES_PASSWORD: ${DB_PASSWORD}

  redis:
    image: redis:7-alpine
    ports: ["6379:6379"]

  celery:
    build: .
    command: celery -A config worker -l info
    env_file: .env
    depends_on: [db, redis]

  celery-beat:
    build: .
    command: celery -A config beat -l info
    env_file: .env
    depends_on: [redis]

volumes:
  pgdata:
```

### 3.3 Project Structure
```
longevity/
├── config/           # Settings, URLs, ASGI, Celery
│   └── settings/     # base.py, dev.py, prod.py, test.py
├── android/          # Android companion app for Samsung sync (R2/R3+)
├── apps/
│   ├── accounts/       # User model, auth, profile, GDPR
│   ├── metrics/        # MetricDefinition, MetricEntry, analytics
│   ├── subscriptions/  # Stripe (R4+)
│   ├── wearables/      # Device-bridge sync first, aggregator/cloud integrations later
│   └── streaming/      # WebSocket consumers (R5+)
├── common/           # Shared utils, middleware, permissions
├── docker-compose.yml
├── Dockerfile
├── .env.example
├── .github/workflows/  # CI/CD
└── terraform/        # IaC (when ready for cloud)
```

### 3.4 Dev Tools
```
# pyproject.toml
[tool.ruff]        # Linter + formatter (replaces flake8 + black + isort)
[tool.pytest.ini_options]
[tool.mypy]        # Optional type checking

# Pre-commit hooks
- ruff (lint + format)
- mypy
- pip-audit (security)
```

### 3.5 Environment Variables
```bash
# .env.example (committed to git)
SECRET_KEY=change-me
DEBUG=True
DATABASE_URL=postgres://postgres:password@db:5432/longevity
REDIS_URL=redis://redis:6379/0
STRIPE_SECRET_KEY=sk_test_xxx
STRIPE_WEBHOOK_SECRET=whsec_xxx
SENTRY_DSN=
```

For MVP Samsung sync, the backend does **not** need Samsung cloud credentials because the Android companion app uploads data directly to our API after reading it on device.

### 3.6 Secrets Management

| Environment | Strategy |
|---|---|
| **Local** | `.env` file (in `.gitignore`), `.env.example` committed |
| **CI** | GitHub Actions secrets (encrypted) |
| **Production** | AWS Secrets Manager, injected at runtime via IAM roles |
| **Never** | Hardcoded in code, committed to git, in Docker image layers |

---

## 4. Backend Development

Follows the progressive rollout (R1→R5):

### R1 — Foundation (Weeks 1-6, Manual-Entry Release)
1. Django project scaffold with split settings (base/dev/prod/test)
2. Custom User model with encrypted PII fields + `email_lookup_hash`
3. JWT auth (register, login, refresh, logout)
4. Basic rate limiting on auth endpoints
5. Security middleware (CORS, CSP, HSTS headers)
6. MetricDefinition model + default seed data migration
7. MetricEntry model + TimescaleDB hypertable
8. Metrics CRUD API with user scoping
9. Basic analytics endpoint (time_bucket queries)
10. API docs via `drf-spectacular`
11. Health endpoint, structured logging, deploy pipeline

### R1.1 — Compliance Hardening (Weeks 7-8)
12. Password reset
13. GDPR endpoints (export, deletion)
14. Audit logging

### R2 — Samsung Validation Spike (Weeks 9-10)
15. Expand `WearableConnection` model for device-bridge sync state
16. Authenticated wearable upload endpoint with `upload_id` idempotency
17. Dedup + normalization service with sync cursor handling
18. Internal Android companion prototype proves `Samsung Health -> app -> backend`

### R3 — Samsung Sync MVP (Weeks 11-13)
19. User-facing connection/list/status endpoints for Samsung sync
20. Replay / resync request flow and connection disconnect handling
21. Background ingestion, reconciliation, and repair Celery tasks
22. Sync error surfacing, retries, and connection health reporting

### R4 — Monetization (Weeks 14-15)
23. Stripe Checkout + Customer Portal integration
24. Subscription model + webhook handler (signature verification, idempotent processing)
25. Tier-based permission enforcement
26. Retention policy Celery task

### R5 — Real-Time + Advanced (Weeks 16-18)
27. Django Channels ASGI setup
28. WebSocket consumer with ticket-based auth
29. Advanced analytics, richer caching, and premium custom metrics
30. Premium API access tier + live dashboard push

---

## 5. Frontend Development (Parallel from R1)

### 5.1 Clients
- Web dashboard: React (Vite)
- Samsung-sync companion app: Kotlin Android app (R2/R3)
### 5.2 Component Library
- Metric Cards (glassmorphic, colored left border)
- Charts (Recharts — area charts with gradient fills)
- Form inputs (metric logging modal)
- Navigation (side nav desktop, bottom tabs mobile)
- Samsung sync status cards, permission prompts, and replay/error states

### 5.3 Routing: React Router
- `/` → Dashboard
- `/metrics/:slug` → Metric detail
- `/settings` → Profile, Samsung sync status, subscription
- `/login`, `/register` → Auth pages

### 5.4 API Integration
- Web: Axios / fetch + JWT interceptor for auto-refresh
- Android: same REST API with JWT auth plus idempotent upload endpoints for sync batches

### 5.5 State Management
- Web: Zustand (simpler than Redux for this scale)
- Android: native local sync state + background work coordination

### 5.6 Responsive
- Web: mobile-first CSS, 4-col → 2-col → 1-col grid
- Sync itself is Android-only in MVP; the web app surfaces status and synced data after upload

---

## 6. Testing

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

---

## 7. Infrastructure & DevOps

### 7.1 IaC (Terraform)

> [!NOTE]
> Don't write Terraform until ready to deploy to cloud. But **do plan** the resources upfront.

Terraform manages:
- VPC + subnets + security groups
- Timescale Cloud service (PostgreSQL + TimescaleDB)
- ElastiCache (Redis)
- ECS Fargate (Django + Celery)
- S3 (backups, static files)
- Secrets Manager
- IAM roles
- CloudWatch log groups

### 7.2 CI/CD (GitHub Actions)

```yaml
# .github/workflows/ci.yml (simplified)
name: CI
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: timescale/timescaledb:latest-pg16
      redis:
        image: redis:7-alpine
    steps:
      - uses: actions/checkout@v4
      - uses: astral-sh/setup-uv@v6
      - run: uv sync --group dev
      - run: uv run ruff check .
      - run: uv run mypy
      - run: uv run pytest tests

  deploy-staging:
    needs: test
    if: github.ref == 'refs/heads/main'
    steps:
      - # Build Docker image
      - # Push to ECR
      - # Invoke staging EC2 through Systems Manager
      - # Run the one-off Docker migration container
      - # Replace Django and verify public health checks
```

### 7.3 Containers
- Single `Dockerfile` (multi-stage: build → prod)
- Docker Compose for local dev (§3.2)
- manually provisioned EC2 plus Docker Compose for staging
- Terraform-managed EC2 for the production MVP
- ECS Fargate for post-MVP managed-container learning and worker separation
- no Kubernetes for the MVP

### 7.4 Secrets
See §3.6.

### 7.5 Backups

> [!IMPORTANT]
> **Yes, backups from day 1 in production.** Use managed database backups plus periodic logical exports. The exact retention can vary by provider plan, so document the real numbers when provisioning.

| What | How | Retention |
|---|---|---|
| Database | Timescale Cloud automated backups | Provider-managed retention |
| Database (extra, later) | Deliberate scheduled `pg_dump` task to versioned S3 | Define before enabling |
| `.env` / Terraform state | Terraform Cloud or S3 + versioning | Indefinite |
| User uploads (if any) | S3 with versioning | Indefinite |

---

## 8. Production Deployment

### 8.1 Hosting

| Component | Service | Why |
|---|---|---|
| **Backend** | AWS EC2 + Docker Compose + ALB | Manual staging teaches AWS directly; Terraform reproduces the topology for the MVP |
| **Database** | Timescale Cloud (PostgreSQL + TimescaleDB) | Managed TimescaleDB without unsupported RDS extension assumptions |
| **Cache** | None initially; post-MVP ElastiCache Redis | Current bounded synchronous requests do not require a broker |
| **Static/Media** | S3 + CloudFront CDN | Global delivery, cheap storage |
| **Frontend** | Vercel or CloudFront + S3 | Free tier, global CDN, auto-deploy from git |

Progression: manually provision isolated EC2 staging and document a runbook;
reproduce the EC2 topology with Terraform before production; post-MVP, move
compute to ECS Fargate and add Redis, Celery Worker, exactly one Beat scheduler,
and S3 job artifacts only when real asynchronous workloads exist.

### 8.2 Domain & SSL
- Domain via Route53 or Cloudflare
- SSL auto-provisioned by ALB (ACM certificate)

### 8.3 Production Environment
- `DEBUG=False`, `ALLOWED_HOSTS` set, `SECURE_*` Django settings
- Secrets from AWS Secrets Manager (not env vars baked in image)
- Gunicorn (WSGI) + Uvicorn (ASGI for Channels)

### 8.4 CDN
- CloudFront in front of S3 for static files (`collectstatic`)
- Cache headers configured per file type

### 8.5 Database Migrations in Production
```bash
# Run the immutable backend image once on EC2 before replacing Django.
docker compose run --rm web uv run python manage.py migrate --no-input
```

The post-MVP Fargate equivalent is a one-off ECS task using the same image and
command.

### 8.6 Rate Limiting & DDoS
- AWS WAF on ALB (basic DDoS protection)
- Django-level rate limiting (`django-ratelimit`) for auth endpoints
- CloudFront for static asset protection

---

## 9. Monitoring & Maintenance

### 9.1 Logging
- **Structured JSON logging** via `python-json-logger`
- Shipped to CloudWatch Logs (MVP) → ELK or Loki (later)
- Request ID traced through all logs

### 9.2 Error Tracking
- **Sentry** — Django + Celery integrations, captures exceptions with full context
- Free tier: 5K events/month (more than enough for MVP)

### 9.3 Uptime Monitoring
- **UptimeRobot** (free) — pings `/api/v1/health/` every 5 min, alerts on failure

### 9.4 Analytics
- **Plausible** (privacy-friendly, no cookies) for frontend page views
- Custom dashboard queries for business metrics (active users, metrics logged/day)

### 9.5 Backups
See §7.5.

---

## 10. Post-Launch

### 10.1 User Feedback
- In-app feedback widget (simple form → stored in DB or shipped to email)
- Discord / community channel for beta users

### 10.2 Performance Monitoring
- Sentry performance (transaction tracing, slow query detection)
- CloudWatch dashboards for infrastructure metrics

### 10.3 Iterate
- Fix bugs as P0 (same day), P1 (within sprint), P2 (backlog)
- Feature requests → backlog → prioritize by user demand

### 10.4 Feature Roadmap
Follow the progressive rollout (R1→R5) with gates between releases:

| Release | Gate to move forward |
|---|---|
| **R1 → R2** | p95 < 300ms, no P0/P1 security findings, 5+ beta users actively logging for 2+ weeks |
| **R2 → R3** | Samsung upload contract proven end-to-end on a real Android device |
| **R3 → R4** | Sync correctness validated, replay/retry flow tested, Samsung kill-switch verified |
| **R4 → R5** | Stripe webhook reliability > 99.9%, entitlement tests green |

### 10.5 Scale When Needed
- Vertical first (bigger Timescale plan, bigger ECS task size)
- Then: read replicas, CDN, Celery worker auto-scaling
- Kubernetes only if you have a team and need multi-region

---

## Appendix: Key Decisions FAQ

### Develop locally or on Docker?
**Both.** Develop your Python code locally (fast iteration, IDE support). Run dependencies (Postgres, Redis) in Docker Compose. The Django dev server runs on your machine, connects to containerized services.

### SDLC?
**Kanban** (solo developer). No sprints, no ceremonies. A simple board: Backlog → In Progress → Review → Done. Move cards as you go. Use GitHub Projects.

### API Gateway from the start?
**Locally: No.** Django dev server is fine. **In production: Yes** — ALB in front of ECS handles routing, TLS, and basic DDoS protection.

### Backups immediately?
**In production: Yes, day 1.** Managed DB backups plus logical exports are non-negotiable. **Locally: No** — your data is disposable test data.

### Full architecture vs MVP?
**MVP architecture first**, with the full architecture as a target. Don't build what you don't need yet. The pragmatic MVP (§1.9) includes the essentials (reverse proxy, backups, secrets management, CI/CD) without the expensive stuff (multi-AZ, Kubernetes, autoscaling groups).

### DevOps learning path?
Linux/Bash → Docker → GitHub Actions CI/CD → Terraform → AWS services → CloudWatch monitoring → (later) Kubernetes, Prometheus/Grafana.
