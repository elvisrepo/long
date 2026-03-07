### 1.8 Data Flow

## Use When
- Load this when you need checks data flow examples.

## Source
- Derived from `reference_docs/knowledge/planning.md` sections 1.8.



```mermaid
sequenceDiagram
    participant U as User
    participant API as Django API
    participant DB as TimescaleDB
    participant R as Redis
    participant C as Celery Worker
    participant W as Wearable Aggregator

    Note over U,W: Manual Metric Logging
    U->>API: POST /metrics/entries/ (JWT)
    API->>API: Validate input, check permissions
    API->>DB: INSERT metric_entry
    API->>R: Invalidate dashboard cache
    API-->>U: 201 Created

    Note over U,W: Wearable Sync (Webhook + Backfill)
    U->>API: POST /wearables/connect/{provider}/ (JWT)
    API-->>U: Hosted link URL
    W->>API: POST /webhooks/wearables/ (signed event)
    API->>C: Enqueue normalization job
    C->>W: Fetch incremental data / backfill
    W-->>C: Wearable payload
    C->>C: Deduplicate, normalize units + timestamps
    C->>DB: Bulk insert metric_entries
    C->>R: Invalidate user cache

    Note over U,W: Dashboard Load
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
