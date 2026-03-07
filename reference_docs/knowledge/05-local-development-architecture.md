## Use When
- Load this when we are working on the local development architecture.

## Source
- Derived from `reference_docs/knowledge/planning.md` sections 1.9.


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