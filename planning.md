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
- Unified view across manual entries + wearable devices (Samsung Health, Health Connect, Apple Health)
- Long-term trend analysis — not just today's data, but months/years of context
- Clean, premium, dark-mode UX — most health apps are cluttered and ugly

### 1.2 Functional Requirements

**Core features (top 3 — what the system must do):**

1. **Users should be able to log health metrics** — manually enter data points (heart rate, VO2 Max, weight, etc.) with timestamps
2. **Users should be able to view their metrics on a dashboard with trend analytics** — see current values, 7/30/90-day trends, averages, min/max
3. **Users should be able to connect wearable devices** — sync data automatically from Samsung Health, Health Connect, Apple Health

**Secondary features (needed for a complete product, but not the core system design challenge):**
- Register / login / logout / password reset (auth)
- Subscribe to paid tiers for advanced features (Stripe)
- Export all data / delete account (GDPR compliance)
- Define custom metrics beyond the defaults
- Receive alerts on anomalous values
- View real-time streaming from wearables (WebSocket)

### 1.3 Non-Functional Requirements

**CAP Theorem: Consistency over Availability.**

Health data must be accurate. If a user logs a metric, it must be persisted correctly every time — we cannot tolerate lost writes or stale reads that show incorrect health data. A brief period of unavailability (seconds during a deploy or failover) is acceptable. A user seeing wrong health data is not.

In practice: single PostgreSQL primary (strong consistency for writes), Redis cache with short TTLs for reads (tolerate slightly stale dashboard data for performance).

| # | Requirement | Target | Why it matters |
|---|---|---|---|
| 1 | **Low-latency analytics queries** | < 200ms p95 for 30-day metric range queries | Users interact with trends constantly — slow charts kill the experience. Drives the TimescaleDB choice. |
| 2 | **Data durability & security** | Zero data loss, field-level encryption for PII, OWASP Top 10 addressed | Health data is sensitive and irreplaceable. Losing it or leaking it destroys trust. |
| 3 | **Consistency for writes** | All metric writes are ACID-committed before returning success | A user logs their blood pressure — it must be there when they check. No eventual consistency for writes. |
| 4 | **GDPR compliance** | Full data export and account deletion within 72 hours | Legal requirement for EU users. Must be designed in, not bolted on. |
| 5 | **Availability** | 99.5% uptime (pragmatic MVP) | Important but secondary to consistency. Brief downtime is tolerable; wrong data is not. |

**Capacity estimation**: Deferred. We're building a time-series health tracker — it's a write-moderate, read-heavy system with predictable load. We'll do targeted math if a specific design decision requires it (e.g., partition size, cache sizing).

### 1.4 Core Entities

**Rationale — how did we decide what to store?**

We derived entities from the functional requirements by asking: *"What data must exist for this feature to work?"*

| Entity | Exists because... | Key design decision |
|---|---|---|
| **User** | Every feature requires knowing *who*. Multi-tenant system — all data is scoped to a user. | PII (email, name, DOB) encrypted at field level. UUID PKs to avoid exposing sequential IDs. |
| **MetricDefinition** | Users need to know *what* they can track. System needs validation rules (unit, min/max range) per metric type. | Separated from MetricEntry to avoid duplicating metadata on every data point. `user_id=NULL` for system defaults, FK to user for custom metrics. |
| **MetricEntry** | Core requirement #1 — the actual data points users log. This is where 99% of storage and query load lives. | TimescaleDB hypertable partitioned by `recorded_at` for efficient time-range queries. Denormalized `user_id` for fast row-level filtering. |
| **ConnectedDevice** | Core requirement #3 — stores OAuth tokens and sync state for each connected wearable provider. | Need to track per-device: which provider, access/refresh tokens (encrypted), last sync timestamp, active status. One user can have multiple devices. |
| **Subscription** | Paid tiers gate features (custom metrics, integrations, streaming). Stripe state must be tracked server-side. | Single source of truth for entitlements. Decoupled from User to cleanly track subscription lifecycle (trialing → active → cancelled → past_due). |
| **AuditLog** | GDPR compliance requires knowing who changed what and when. Also useful for debugging and security forensics. | Append-only. Stores diffs (`jsonb changes`), not full snapshots. |

**Relationships & Cardinalities:**

| Relationship | Cardinality | Meaning |
|---|---|---|
| User → MetricEntry | **1 : M** | A user logs many data points. An entry belongs to exactly one user. |
| User → ConnectedDevice | **1 : M** | A user connects multiple wearables. Each device belongs to one user. |
| User → Subscription | **1 : M** | A user has subscription history (trialing → active → cancelled). Typically one active at a time, but we keep history. |
| User → MetricDefinition | **1 : M** | A user can create custom metrics. System defaults have `user_id=NULL` (shared across all users). |
| User → AuditLog | **1 : M** | A user generates many audit entries. Append-only, never updated. |
| MetricDefinition → MetricEntry | **1 : M** | Each entry is "of" exactly one metric type (e.g., every heart rate reading points to the "Resting Heart Rate" definition). |
| ConnectedDevice → MetricEntry | **1 : M** (optional) | Entries *can* be sourced from a device (`source_device_id` is nullable). Manual entries have no device. |

> The `MetricDefinition → MetricEntry` split is the most important design choice: separating *what a metric is* (definition) from *each recorded value* (entry) gives us clean normalization, per-metric validation rules, and the ability to add custom metrics without schema changes.

### 1.6 MVP vs Nice-to-Have

| MVP (R1) | Nice-to-Have (R2+) |
|---|---|
| Register / login / logout / password reset | OAuth social login (Google, Apple) |
| Manual metric logging (default metrics) | Custom metric definitions |
| Dashboard with latest values + 7/30-day trends | Advanced analytics (percentiles, anomaly detection) |
| GDPR export + account deletion | Data comparison between metrics |
| Audit logging | MFA (TOTP) |
| Basic CI/CD + Docker | Real-time WebSocket streaming |
| | Stripe subscriptions |
| | Wearable device integrations |
| | Premium API access |

### 1.7 API Design

**Protocol: REST.** Standard CRUD operations over HTTP, resources map directly to our entities. No reason to use GraphQL (we don't have complex nested queries or multiple client types with different data needs) or gRPC (no microservices, no internal service-to-service calls). REST is well-understood, has great Django/DRF tooling, and covers 100% of our use cases.

**Versioning:** URL-based (`/api/v1/`). Explicit, easy to test, easy to route.

**Auth:** All endpoints except register/login require a valid JWT in the `Authorization: Bearer <token>` header. Rate limiting applied at the auth layer (5 login attempts/min, 3 password resets/hour).

#### Auth (public — no JWT required)
| Method | Endpoint | Description | Notes |
|---|---|---|---|
| POST | `/api/v1/auth/register/` | User registration | Returns 201 + user object |
| POST | `/api/v1/auth/login/` | JWT token pair | Returns access + refresh tokens |
| POST | `/api/v1/auth/refresh/` | Refresh access token | Idempotent — same refresh token gives same access token |
| POST | `/api/v1/auth/logout/` | Blacklist refresh token | |
| POST | `/api/v1/auth/password/reset/` | Password reset email | Rate limited: 3/hour |
| POST | `/api/v1/auth/password/confirm/` | Confirm password reset | |

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
| POST | `/api/v1/metrics/definitions/` | Create custom metric (R2+) | |
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
  "next_cursor": "eyJpZCI6IDk4NDI5Mn0=",
  "has_more": true
}

// Next page:
GET /api/v1/metrics/entries/?metric=resting_hr&cursor=eyJpZCI6IDk4NDI5Mn0=&limit=20
```
Cursor-based (not offset-based) because metric entries are time-series data — new entries are constantly added, and offset pagination would cause duplicates/gaps. The cursor encodes the last entry's ID.

**Data passing convention:**
- **Path params** → required resource identifiers (`/analytics/{slug}/`, `/devices/{id}/`)
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

#### Subscriptions (R2+, JWT required)
| Method | Endpoint | Description | Notes |
|---|---|---|---|
| GET | `/api/v1/subscriptions/plans/` | Available plans | Public-ish — could be unauthenticated |
| POST | `/api/v1/subscriptions/checkout/` | Create Stripe Checkout session | Returns redirect URL, idempotent per session |
| POST | `/api/v1/subscriptions/portal/` | Stripe Customer Portal link | |
| POST | `/api/v1/webhooks/stripe/` | Stripe webhook receiver | No JWT — uses Stripe signature verification instead |

#### Devices (R3+, JWT required)
| Method | Endpoint | Description | Notes |
|---|---|---|---|
| GET | `/api/v1/devices/` | List connected devices | |
| POST | `/api/v1/devices/connect/{provider}/` | Initiate OAuth | `provider` is required — path param |
| GET | `/api/v1/devices/callback/{provider}/` | OAuth callback | |
| DELETE | `/api/v1/devices/{id}/` | Disconnect | Idempotent |
| POST | `/api/v1/devices/{id}/sync/` | Trigger manual sync | Returns 202 Accepted — async via Celery |

#### Real-Time Streaming (R4+)
```
ws://host/ws/metrics/stream/
```
Not REST — persistent WebSocket connection. Ticket-based auth (short-lived token from REST endpoint, included in WS handshake). Token-bucket backpressure (10 pts/sec max), server sends `SLOW_DOWN` frame on overflow.

### 1.8 Data Flow

```mermaid
sequenceDiagram
    participant U as User/Wearable
    participant API as Django API
    participant DB as PostgreSQL + TimescaleDB
    participant R as Redis
    participant C as Celery Worker
    participant S as External Service

    Note over U,S: Manual Metric Logging
    U->>API: POST /metrics/entries/ (JWT)
    API->>API: Validate input, check permissions
    API->>DB: INSERT metric_entry
    API->>R: Invalidate dashboard cache
    API-->>U: 201 Created

    Note over U,S: Device Sync (Background)
    C->>S: Fetch latest data (OAuth token)
    S-->>C: Health data response
    C->>C: Deduplicate, normalize timestamps
    C->>DB: Bulk insert metric_entries
    C->>R: Invalidate user cache

    Note over U,S: Dashboard Load
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

#### Pragmatic MVP Cloud Architecture (Target)
```mermaid
graph TB
    subgraph "Internet"
        USER["Users / Browsers"]
    end

    subgraph "Cloud Provider - AWS"
        subgraph "Edge"
            GW["API Gateway / ALB"]
        end

        subgraph "Compute"
            APP["Django App<br/>(App Runner / ECS)"]
            WORKER["Celery Worker<br/>(ECS Task)"]
        end

        subgraph "Data"
            RDS[("RDS PostgreSQL<br/>+ TimescaleDB")]
            ELASTICACHE[("ElastiCache Redis")]
            S3["S3 Bucket<br/>(Backups, Static)"]
        end

        subgraph "Security & Config"
            SECRETS["Secrets Manager"]
            IAM["IAM Roles"]
        end

        subgraph "Ops"
            CW["CloudWatch<br/>(Logs + Metrics)"]
            BACKUP["Automated RDS Backups"]
        end
    end

    subgraph "CI/CD"
        GHA["GitHub Actions"]
        ECR["ECR<br/>(Container Registry)"]
    end

    USER --> GW --> APP
    APP --> RDS
    APP --> ELASTICACHE
    APP --> SECRETS
    WORKER --> RDS
    WORKER --> ELASTICACHE
    GHA --> ECR --> APP
    RDS --> BACKUP
    BACKUP --> S3
    APP --> CW
```

#### Full Requirements Architecture (Target — All Features)

This is the architecture when all releases (R1–R5) are complete: auth, metrics, subscriptions, device integrations, real-time streaming, analytics — everything running in production.

```mermaid
graph TB
    subgraph "Client Layer"
        WEB["React SPA<br/>(Vite)"]
        MOBILE["Companion Mobile App<br/>(Health Connect + HealthKit sync)"]
        WEARABLE["Wearable Devices<br/>(Samsung Watch, etc.)"]
    end

    subgraph "Edge"
        NGINX["ALB / API Gateway<br/>(TLS, CORS, Rate Limiting)"]
    end

    subgraph "Application Layer"
        DJANGO["Django REST API<br/>(Gunicorn, WSGI)"]
        CHANNELS["Django Channels<br/>(Uvicorn, ASGI — WebSockets)"]
        CELERY["Celery Workers<br/>(Sync, Analytics, Webhooks)"]
        BEAT["Celery Beat<br/>(Scheduled Tasks)"]
    end

    subgraph "Data Layer"
        PG[("PostgreSQL + TimescaleDB<br/>(Metrics, Users, Subscriptions)")]
        REDIS[("Redis<br/>(Cache + Broker + Pub/Sub)")]
        S3["S3<br/>(Exports, Backups, Static)"]
    end

    subgraph "External Services"
        STRIPE["Stripe API<br/>(Checkout, Webhooks, Portal)"]
        SAMSUNG["Samsung Health Data SDK"]
        HC["Health Connect / HealthKit<br/>(via Companion App)"]
        SENTRY_EXT["Sentry<br/>(Error Tracking)"]
    end

    WEB -- "HTTPS" --> NGINX
    MOBILE -- "HTTPS" --> NGINX
    WEARABLE -- "WSS" --> NGINX

    NGINX -- "REST" --> DJANGO
    NGINX -- "WebSocket" --> CHANNELS

    DJANGO --> PG
    DJANGO --> REDIS
    DJANGO --> STRIPE
    DJANGO --> SENTRY_EXT

    CHANNELS --> REDIS
    CHANNELS --> PG

    CELERY --> PG
    CELERY --> REDIS
    CELERY --> SAMSUNG
    CELERY --> HC
    CELERY --> S3

    BEAT --> REDIS

    STRIPE -- "Webhooks" --> DJANGO
```

**How traffic flows:**
- **REST requests** (login, log metric, fetch analytics) → ALB → Django (Gunicorn/WSGI)
- **WebSocket connections** (live streaming from wearable) → ALB → Django Channels (Uvicorn/ASGI) → Redis Pub/Sub → all connected dashboards
- **Background work** (device sync, analytics computation, Stripe webhooks, GDPR exports) → Celery Workers ← Redis broker
- **Scheduled jobs** (nightly aggregates, token refresh) → Celery Beat → Redis → Workers
- **External calls** → Celery Workers connect to Samsung Health SDK, Health Connect (via companion app), Stripe

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
        PG_PRIMARY[("RDS Primary<br/>(Writes only)")]
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
| **Celery** | 1 worker | Auto-scaled worker pool | Device syncs and analytics jobs scale with user count. ECS auto-scales workers based on queue depth. |
| **CDN** | Optional | Required | At scale, serving static assets and caching API responses at the edge saves massive bandwidth and reduces latency globally. |
| **WAF** | Basic | Required | At 1M+ users, you're a target for DDoS, credential stuffing, and abuse. WAF filters malicious traffic before it reaches your servers. |
| **Monitoring** | CloudWatch + Sentry | Prometheus + Grafana + Sentry | CloudWatch is fine for MVP. At scale, Prometheus gives you custom metrics (requests/sec per endpoint, p99 latency, queue depths) and Grafana gives you dashboards to spot problems before users notice. |

> [!NOTE]
> **When to actually do this:** Not until you have clear evidence the MVP can't handle the load. Signs: p95 latency > 500ms, DB CPU > 70% sustained, connection pool exhaustion. Don't pre-optimize.

### 1.10 Deep Dives

#### Security (OWASP Top 10 addressed)
| OWASP Risk | Mitigation |
|---|---|
| A01 Broken Access Control | Row-level security (all queries scoped by `user_id`), permission classes per view |
| A02 Cryptographic Failures | Argon2 passwords, field-level encryption for PII, TLS 1.3, no secrets in code |
| A03 Injection | Django ORM (parameterized queries), strict serializer validation |
| A04 Insecure Design | Threat modeling in this plan, rate limiting, audit logging |
| A05 Security Misconfiguration | CSP/HSTS/CORS headers, `DEBUG=False` in prod, secrets in Secrets Manager |
| A06 Vulnerable Components | Dependabot alerts, `pip-audit` in CI |
| A07 Auth Failures | JWT with short TTL (15 min), rate-limited login (5/min), refresh token rotation |
| A08 Data Integrity Failures | Stripe webhook signature verification, input validation with range checks |
| A09 Logging Failures | `django-auditlog` on all models, structured logging, CloudWatch |
| A10 SSRF | No user-supplied URLs in server-side requests, OAuth callbacks whitelisted |

#### Edge Cases
- **Duplicate data from device sync**: Dedup by `(user_id, metric_definition_id, recorded_at, source)` unique constraint. If a duplicate arrives, upsert (ignore or update).
- **Timezone hell**: All timestamps stored as UTC (`timestamptz`). User's timezone stored on profile for display only. `recorded_at` is always UTC — the frontend converts for display.
- **Metric value out of range**: Rejected at serializer level. MetricDefinition has `min_value` and `max_value` — a heart rate of 500 bpm gets a 400 error.
- **Stripe webhook replay**: Idempotency key check. Store processed Stripe event IDs in a `StripeEvent` table. If we see the same event ID twice, skip processing.
- **Token expiry during WebSocket session**: Server sends `AUTH_EXPIRED` frame. Client must close the socket, re-authenticate via REST, get a new WS ticket, and reconnect.
- **User deletes account mid-sync**: Celery task checks `user.is_active` before writing data. If user is deleted, task aborts gracefully.
- **Concurrent metric writes for same timestamp**: The unique constraint on `(user_id, metric_definition_id, recorded_at, source)` prevents silent overwrites. Second write gets a conflict error.
- **Wearable sends data during network outage**: WebSocket client should buffer locally and retry. Server accepts out-of-order data (sorted by `recorded_at`, not arrival time).

#### Bottlenecks & Mitigations
| Bottleneck | Symptom | Mitigation |
|---|---|---|
| Dashboard analytics on millions of rows | Slow dashboard loads (> 1s) | TimescaleDB `time_bucket()` + pre-computed daily aggregates via nightly Celery task. Cache results in Redis (10 min TTL). |
| Single Postgres primary under write load | Connection pool exhaustion, write latency spikes | Read replicas for analytics queries. Only writes go to primary. Connection pooling via PgBouncer. |
| Redis as single point of failure | Cache miss storm, Celery stalls, WS drops | ElastiCache cluster with automatic failover. App degrades gracefully (skip cache, serve from DB). |
| Third-party API rate limits (Samsung, Health Connect) | Sync jobs fail in bursts | Celery retry with exponential backoff + jitter. Per-user rate limiting on sync requests. Provider-level circuit breaker. |
| WebSocket connection memory (1000+ concurrent) | OOM on app instance | Token-bucket backpressure. Max 3 connections per user. Separate WS instances from REST API at scale. |
| Large GDPR export (user with 100K+ entries) | Request timeout | Async export via Celery. Return 202 Accepted + poll endpoint. Stream results to S3, send download link via email. |

### 1.11 ERD

```mermaid
erDiagram
    User ||--o{ Subscription : has
    User ||--o{ MetricDefinition : creates
    User ||--o{ MetricEntry : logs
    User ||--o{ ConnectedDevice : connects
    User ||--o{ AuditLog : generates
    MetricDefinition ||--o{ MetricEntry : "defines type for"
    ConnectedDevice ||--o{ MetricEntry : sources

    User {
        uuid id PK
        string email "encrypted, unique"
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
        uuid source_device_id FK "nullable"
        string source "manual|samsung_health|health_connect|apple_health|device_stream"
        jsonb context
        timestamptz created_at
    }

    ConnectedDevice {
        uuid id PK
        uuid user_id FK
        string provider "samsung_health|health_connect|apple_health|aggregator"
        string external_user_id "encrypted"
        string access_token "encrypted"
        string refresh_token "encrypted"
        datetime token_expires_at
        datetime last_synced_at
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
│  Rest HR      58 bpm           samsung  5 Mar     │
└─────────────────────────────────────────────────────┘
```

**Color tokens**: `--bg-primary: #0A0A0F`, `--bg-card: #12121A`, `--accent-teal: #00D4AA`, `--accent-red: #FF4D6A`, `--accent-amber: #FFB84D`

**Typography**: Inter (headings) + JetBrains Mono (metric values)

### 1.13 Tech Stack

| Layer | Choice | Why |
|---|---|---|
| **Backend** | Python / Django + DRF | Know it well, batteries-included, great ORM |
| **Database** | PostgreSQL + TimescaleDB | Best relational DB + time-series extension, no extra service |
| **Cache / Broker** | Redis | Cache + Celery broker + Channels pub/sub in one |
| **Task Queue** | Celery + Celery Beat | Mature, Django-native, handles scheduled + async tasks |
| **WebSockets** | Django Channels | Stays in Django ecosystem, ASGI support |
| **Frontend** | React (Vite) | Fast, huge ecosystem, Recharts for data viz |
| **Payments** | Stripe | Best docs, Checkout + Customer Portal = minimal frontend work |
| **Auth** | djangorestframework-simplejwt | JWT, stays in DRF ecosystem |
| **Containerization** | Docker + Docker Compose | Local dev parity, easy cloud deployment |
| **CI/CD** | GitHub Actions | Free for public repos, simple YAML config |
| **IaC** | Terraform | Cloud-agnostic, version-controlled infrastructure |
| **Cloud** | AWS (App Runner / ECS, RDS, ElastiCache, S3) | Most job-relevant, pragmatic managed services |
| **Monitoring** | CloudWatch (MVP) → Prometheus + Grafana (later) | Start simple, upgrade when needed |
| **Error Tracking** | Sentry | Free tier, Django integration, best-in-class |

### 1.14 Success Metrics / KPIs

| KPI | Target | How to measure |
|---|---|---|
| MVP shipped | Within 4 weeks | Deployed, functional, passing tests |
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
- PII encrypted at field level
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

#### What does "MetricEntry sources ConnectedDevice" mean?

The `source_device_id` FK on MetricEntry answers: **"Where did this data point come from?"**

- A manual entry (user typed it in): `source_device_id = NULL`, `source = 'manual'`
- An auto-synced entry from Samsung watch: `source_device_id = 'uuid-of-samsung-device'`, `source = 'samsung_health'`

This lets us show provenance ("this reading came from your Galaxy Watch 6"), filter by source, and detect duplicates across sync jobs.

#### Sample Data Across All Tables

**Users:**
| id | email | first_name | timezone | is_active |
|---|---|---|---|---|
| `a1b2c3d4-...` | `alice@enc...` | `Alice (enc)` | `Europe/Berlin` | true |
| `e5f6g7h8-...` | `bob@enc...` | `Bob (enc)` | `America/New_York` | true |

**MetricDefinitions (system defaults, `user_id = NULL`):**
| id | user_id | name | slug | unit | category | min | max | is_default |
|---|---|---|---|---|---|---|---|---|
| `def-001` | NULL | Resting Heart Rate | `resting_hr` | bpm | cardiovascular | 30 | 220 | true |
| `def-002` | NULL | VO2 Max | `vo2_max` | ml/kg/min | cardiovascular | 10 | 90 | true |
| `def-003` | NULL | Sleep Duration | `sleep_duration` | hours | recovery | 0 | 24 | true |
| `def-004` | NULL | Body Weight | `body_weight` | kg | body_composition | 20 | 300 | true |
| `def-005` | NULL | Blood Pressure (Systolic) | `bp_systolic` | mmHg | cardiovascular | 60 | 250 | true |
| `def-custom` | `a1b2c3d4-...` | Cold Plunge Duration | `cold_plunge` | minutes | recovery | 0 | 60 | false |

**ConnectedDevices:**
| id | user_id | provider | last_synced_at | is_active |
|---|---|---|---|---|
| `dev-001` | `a1b2c3d4-...` | samsung_health | 2026-03-06 07:00 UTC | true |
| `dev-002` | `e5f6g7h8-...` | health_connect | 2026-03-05 22:30 UTC | true |

**MetricEntries (the actual data points):**
| id | user_id | metric_definition_id | value | recorded_at | source_device_id | source |
|---|---|---|---|---|---|---|
| 1 | `a1b2c3d4-...` | `def-001` (Resting HR) | 58 | 2026-03-06 07:15 UTC | `dev-001` | samsung_health |
| 2 | `a1b2c3d4-...` | `def-002` (VO2 Max) | 42.5 | 2026-03-06 08:30 UTC | NULL | manual |
| 3 | `a1b2c3d4-...` | `def-003` (Sleep) | 7.5 | 2026-03-06 06:30 UTC | `dev-001` | samsung_health |
| 4 | `a1b2c3d4-...` | `def-custom` (Cold Plunge) | 3.5 | 2026-03-06 09:00 UTC | NULL | manual |
| 5 | `e5f6g7h8-...` | `def-001` (Resting HR) | 65 | 2026-03-05 22:00 UTC | `dev-002` | health_connect |

Notice row 1: Alice's resting HR of 58 bpm was *auto-synced* from her Samsung device (`source_device_id = dev-001`). Row 2: her VO2 Max was *manually entered* (`source_device_id = NULL`). Row 4: her custom "Cold Plunge" metric uses a definition she created herself.

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
- **OAuth social login** (Google, Apple) in R2
- **OAuth 2.0** for device integrations (Samsung Health, Health Connect)
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
(Docker Compose)          (Single-instance         (All features,            (Read replicas,
                           cloud deploy)            all integrations)         auto-scaling,
You code here.            R1 deploys here.         R1–R5 complete.           CDN, WAF)
Never changes.            Infra grows in place.    This is the goal.         Only if needed.
```

**Your ultimate target is #3 — Full Requirements Architecture.** #4 is for reference / interviews / if you get massive traction.

**Key insight: #2 evolves into #3 naturally.** You don't "migrate" — you add components to the same cloud infrastructure as you ship each release:
- **R1**: Django + Postgres + Redis on cloud → **architecture #2**
- **R2**: Add Stripe webhook endpoint → same infra, just new code
- **R3**: Add Celery tasks calling Samsung Health, add OAuth flow → same infra, add a Celery worker ECS task
- **R4**: Add Django Channels, add Uvicorn alongside Gunicorn → same infra, add ASGI routing
- **R5**: Add analytics endpoints → same infra, just new code
- **End result: architecture #3 — without ever "migrating"**

#### Vertical Slice Implementation

Build features end-to-end (model → serializer → view → test → deploy), not layer-by-layer.

| Horizontal (❌ don't do this) | Vertical (✅ do this) |
|---|---|
| Week 1: Build ALL models | Week 1: Build auth end-to-end |
| Week 2: Build ALL serializers | Week 2: Build metric logging end-to-end |
| Week 3: Build ALL views | Week 3: Build dashboard analytics end-to-end |
| Week 4: Try to connect everything | Each week delivers a working, tested, deployed feature |

**R1 MVP vertical slices (~2-4 days each):**

| Slice | What you build | Shippable result |
|---|---|---|
| **1. Scaffold** | Django project, Docker Compose, CI pipeline, deploy pipeline | Empty app deployed to cloud, CI runs on push |
| **2. Auth** | User model, register, login, refresh, logout, password reset, rate limiting | Users can create accounts and log in |
| **3. Metric definitions** | MetricDefinition model, seed data migration, list endpoint | API returns available metrics |
| **4. Metric logging** | MetricEntry model, TimescaleDB hypertable, create/list/filter endpoints | Users can log and retrieve metrics |
| **5. Analytics** | time_bucket queries, analytics endpoint, Redis caching | Users can see 7/30-day trends |
| **6. GDPR + Audit** | Export endpoint, deletion endpoint, audit logging | Users can export/delete data |
| **7. Polish** | Error handling, API docs, security headers, test coverage to 80% | Production-ready MVP |

Each slice: code → test → PR → CI green → merge → deploy.

#### Tech Learning Timeline

You don't need to learn everything before starting. Learn each tech right before the slice that needs it:

| Phase | Tech to learn | Estimated ramp-up |
|---|---|---|
| **Before Slice 1** | Docker Compose, GitHub Actions CI, Terraform basics | 1-2 days |
| **Slices 2-7 (R1)** | Django + DRF, PostgreSQL + TimescaleDB, pytest, Redis (cache), JWT auth | Core skills — should already know Django/DRF |
| **R2 (Monetization)** | Stripe API (Checkout, webhooks), Celery basics | 1-2 days |
| **R3 (Integrations)** | OAuth 2.0 flow, Celery (retries, backoff, scheduling), Samsung Health SDK | 2-3 days |
| **R4 (Real-Time)** | Django Channels, WebSocket protocol, Redis Pub/Sub | 2-4 days (steepest curve) |
| **R5 (Advanced)** | Data analysis patterns (percentiles, anomaly detection), advanced caching | 1-2 days |

---

## 3. Development Environment Setup

### 3.1 Version Control
```bash
git init
# GitHub repo with branch protection on main
# PRs required, CI must pass before merge
```

### 3.2 Docker Compose
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
├── apps/
│   ├── accounts/     # User model, auth, profile, GDPR
│   ├── metrics/      # MetricDefinition, MetricEntry, analytics
│   ├── subscriptions/  # Stripe (R2+)
│   ├── devices/      # Wearable integrations (R3+)
│   └── streaming/    # WebSocket consumers (R4+)
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

### R1 — Foundation (Weeks 1-4, MVP)
1. Django project scaffold with split settings (base/dev/prod/test)
2. Custom User model with encrypted PII fields
3. JWT auth (register, login, refresh, logout, password reset)
4. Rate limiting on auth endpoints
5. Security middleware (CORS, CSP, HSTS headers)
6. MetricDefinition model + default seed data migration
7. MetricEntry model + TimescaleDB hypertable
8. Metrics CRUD API with row-level security
9. Basic analytics endpoint (time_bucket queries)
10. GDPR endpoints (export, deletion)
11. Audit logging
12. API docs via `drf-spectacular`

### R2 — Monetization (Weeks 5-6)
13. Stripe Checkout + Customer Portal integration
14. Subscription model + webhook handler (signature verification, idempotent processing)
15. Tier-based permission enforcement
16. Retention policy Celery task

### R3 — Integrations (Weeks 7-8)
17. OAuth flow for Samsung Health / Health Connect
18. Token storage with field encryption
19. Periodic sync Celery task with dedup
20. Data reconciliation (timestamp + source unique constraint)

### R4 — Real-Time (Weeks 9-10)
21. Django Channels ASGI setup
22. WebSocket consumer with ticket-based auth
23. Token-bucket backpressure
24. Live dashboard push

### R5 — Advanced (Weeks 11-12)
25. Advanced analytics (percentiles, anomaly detection)
26. Full caching layer
27. Custom metric definitions for premium users
28. Premium API access tier

---

## 5. Frontend Development (Parallel from R1)

### 5.1 Framework: React (Vite)
### 5.2 Component Library
- Metric Cards (glassmorphic, colored left border)
- Charts (Recharts — area charts with gradient fills)
- Form inputs (metric logging modal)
- Navigation (side nav desktop, bottom tabs mobile)

### 5.3 Routing: React Router
- `/` → Dashboard
- `/metrics/:slug` → Metric detail
- `/settings` → Profile, connected devices, subscription
- `/login`, `/register` → Auth pages

### 5.4 API Integration: Axios / fetch + JWT interceptor for auto-refresh

### 5.5 State Management: Zustand (simpler than Redux for this scale)

### 5.6 Responsive: Mobile-first CSS, 4-col → 2-col → 1-col grid

---

## 6. Testing

| Type | Tool | What | When |
|---|---|---|---|
| **Unit** | pytest + pytest-django | Models, services, serializers, validators | Every PR (CI) |
| **Integration** | pytest + DRF `APIClient` | Full API endpoint flows (auth → create metric → query analytics) | Every PR (CI) |
| **E2E** | Playwright | Login → log metric → see on dashboard → export data | Pre-release |
| **Performance** | Locust | Load test: 100 concurrent users, metrics CRUD + analytics queries | Pre-R2 launch |
| **Security** | pip-audit + bandit | Dependency vulnerabilities + code security patterns | Every PR (CI) |

**Coverage target**: 80%+ via `pytest-cov`, enforced in CI.

---

## 7. Infrastructure & DevOps

### 7.1 IaC (Terraform)

> [!NOTE]
> Don't write Terraform until ready to deploy to cloud. But **do plan** the resources upfront.

Terraform manages:
- VPC + subnets + security groups
- RDS (PostgreSQL + TimescaleDB)
- ElastiCache (Redis)
- App Runner or ECS (Django + Celery)
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
      - uses: actions/setup-python@v5
      - run: pip install -r requirements/dev.txt
      - run: ruff check .
      - run: pytest --cov --cov-fail-under=80
      - run: pip-audit

  deploy:
    needs: test
    if: github.ref == 'refs/heads/main'
    steps:
      - # Build Docker image
      - # Push to ECR
      - # Deploy to App Runner / ECS
```

### 7.3 Containers
- Single `Dockerfile` (multi-stage: build → prod)
- Docker Compose for local dev (§3.2)
- ECS or App Runner for cloud (not Kubernetes — overkill for solo dev)

### 7.4 Secrets
See §3.6.

### 7.5 Backups

> [!IMPORTANT]
> **Yes, backups from day 1 in production.** RDS automated backups are free (up to DB size), zero effort.

| What | How | Retention |
|---|---|---|
| Database | RDS automated daily snapshots | 30 days |
| Database (extra) | `pg_dump` to S3 via Celery task (weekly) | 90 days |
| `.env` / Terraform state | Terraform Cloud or S3 + versioning | Indefinite |
| User uploads (if any) | S3 with versioning | Indefinite |

---

## 8. Production Deployment

### 8.1 Hosting

| Component | Service | Why |
|---|---|---|
| **Backend** | AWS App Runner or ECS Fargate | Managed containers, auto-scaling, no servers to patch |
| **Database** | AWS RDS (PostgreSQL 16 + TimescaleDB) | Managed, automated backups, failover |
| **Cache** | AWS ElastiCache (Redis) | Managed, automatic failover |
| **Static/Media** | S3 + CloudFront CDN | Global delivery, cheap storage |
| **Frontend** | Vercel or CloudFront + S3 | Free tier, global CDN, auto-deploy from git |

### 8.2 Domain & SSL
- Domain via Route53 or Cloudflare
- SSL auto-provisioned by App Runner / ALB (ACM certificate)

### 8.3 Production Environment
- `DEBUG=False`, `ALLOWED_HOSTS` set, `SECURE_*` Django settings
- Secrets from AWS Secrets Manager (not env vars baked in image)
- Gunicorn (WSGI) + Uvicorn (ASGI for Channels)

### 8.4 CDN
- CloudFront in front of S3 for static files (`collectstatic`)
- Cache headers configured per file type

### 8.5 Database Migrations in Production
```bash
# Run as a one-off ECS task or App Runner command before deploy
python manage.py migrate --no-input
```

### 8.6 Rate Limiting & DDoS
- AWS WAF on API Gateway/ALB (basic DDoS protection)
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
| **R2 → R3** | Stripe webhook reliability > 99.9%, entitlement tests green |
| **R3 → R4** | Sync correctness validated, provider kill-switch tested |
| **R4 → R5** | WS stability under load test, fallback-to-polling verified |

### 10.5 Scale When Needed
- Vertical first (bigger RDS instance, bigger App Runner container)
- Then: read replicas, CDN, Celery worker auto-scaling
- Kubernetes only if you have a team and need multi-region

---

## Appendix: Key Decisions FAQ

### Develop locally or on Docker?
**Both.** Develop your Python code locally (fast iteration, IDE support). Run dependencies (Postgres, Redis) in Docker Compose. The Django dev server runs on your machine, connects to containerized services.

### SDLC?
**Kanban** (solo developer). No sprints, no ceremonies. A simple board: Backlog → In Progress → Review → Done. Move cards as you go. Use GitHub Projects.

### API Gateway from the start?
**Locally: No.** Django dev server is fine. **In production: Yes** — ALB or App Runner handles routing, TLS, and basic DDoS protection. It's included by default with managed services.

### Backups immediately?
**In production: Yes, day 1.** RDS automated backups are free and zero-config. **Locally: No** — your data is disposable test data.

### Full architecture vs MVP?
**MVP architecture first**, with the full architecture as a target. Don't build what you don't need yet. The pragmatic MVP (§1.9) includes the essentials (reverse proxy, backups, secrets management, CI/CD) without the expensive stuff (multi-AZ, Kubernetes, autoscaling groups).

### DevOps learning path?
Linux/Bash → Docker → GitHub Actions CI/CD → Terraform → AWS services → CloudWatch monitoring → (later) Kubernetes, Prometheus/Grafana.