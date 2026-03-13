#### Full Requirements Architecture (Target — All Features)

## Use When
- Load this when you need to work on implementing Full Requirements Architecture .

## Source
- Derived from `reference_docs/knowledge/planning.md` sections 1.9.

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
