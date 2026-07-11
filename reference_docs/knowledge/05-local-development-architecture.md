## Use When
- Load this when we are working on the local development architecture.

## Source
- Derived from `reference_docs/knowledge/planning.md` sections 1.9.


#### Local Development Architecture

This diagram shows the **current backend local runtime** used to build the manual-entry foundation phase.

Samsung Health sync is intentionally **not** represented here. The MVP sync path requires an Android companion app and on-device health data access, so this diagram stays backend-only until that work begins.

Redis, Celery Worker, Celery Beat, and TimescaleDB are present in the local runtime, but they are mostly prepared infrastructure at the current project stage. The implemented auth, manual metrics, Settings, Stripe Checkout, Stripe Portal, and Stripe webhook flows run synchronously inside Django. Celery becomes important when wearable sync, backfills, retries, analytics precomputation, and export/delete jobs are implemented. TimescaleDB becomes important when metric volume and range/aggregate queries justify hypertables, continuous aggregates, retention, or compression policies.

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
- PostgreSQL is required now; TimescaleDB-specific features are planned leverage rather than active core behavior.
- Redis/Celery/Beat are running-capable locally, but current product behavior does not depend on meaningful asynchronous jobs yet.
- In the Samsung-sync MVP, data is uploaded from an Android companion app; the backend does not call a Samsung cloud API directly.
- When R2/R3 work begins, document the Android emulator/device setup separately instead of overloading this diagram.
