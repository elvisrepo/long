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
        AGG["Wearable Aggregator API<br/>(Link flow, webhooks, backfills)"]
        PROVIDERS["Wearable Providers<br/>(Garmin, Fitbit, Oura, Withings)"]
        SENTRY_EXT["Sentry<br/>(Error Tracking)"]
    end

    WEB -- "HTTPS" --> NGINX

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
- **REST requests** (login, log metric, fetch analytics) → ALB → Django (Gunicorn/WSGI)
- **WebSocket connections** (live dashboard updates) → ALB → Django Channels (Uvicorn/ASGI) → Redis Pub/Sub → connected dashboards
- **Background work** (wearable backfills, analytics computation, Stripe webhooks, GDPR exports) → Celery Workers ← Redis broker
- **Scheduled jobs** (nightly aggregates, token refresh) → Celery Beat → Redis → Workers
- **External calls** → Celery Workers connect to the wearable aggregator + Stripe