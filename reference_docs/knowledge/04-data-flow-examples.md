### 1.8 Data Flow

## Use When
- Load this when you need checks data flow examples.

## Source
- Derived from `reference_docs/knowledge/planning.md` sections 1.8.



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

## Metric Definition Include-Inactive Read Flow

Use this flow when reasoning about the `/metrics` catalog and the future archived custom metrics UI.

Active-only reads:
- Frontend calls `useMetricDefinitionsQuery({})`.
- TanStack Query stores the response under `['metric-definitions', {}]`.
- API helper calls `GET /api/v1/metrics/definitions/`.
- Backend returns active system defaults plus the authenticated user's active custom metrics.

Archived-management reads:
- Frontend calls `useMetricDefinitionsQuery({ includeInactive: true })`.
- TanStack Query stores the response under `['metric-definitions', { includeInactive: true }]`, separate from the active-only cache.
- API helper maps camelCase to the public API query string and calls `GET /api/v1/metrics/definitions/?include_inactive=true`.
- Django routes the request to `MetricDefinitionListView`.
- DRF checks `IsAuthenticated`; unauthenticated callers receive `401`.
- `MetricDefinitionListView.get_queryset()` sees `include_inactive=true` and returns active system defaults plus all custom metrics owned by `request.user`.
- The queryset intentionally excludes inactive system defaults and all custom metrics owned by other users.
- `MetricDefinitionSerializer` returns `is_active` so the frontend can split active metrics from archived custom metrics.

Conceptual backend filter for `include_inactive=true`:

```sql
WHERE (user_id IS NULL AND is_active = true)
   OR user_id = current_user_id
ORDER BY category, name
```

Conceptual frontend split after the response:

```ts
const activeDefinitions = metricDefinitions.filter((definition) => (
  definition.is_active
))

const archivedCustomDefinitions = metricDefinitions.filter((definition) => (
  !definition.is_active && !definition.is_default
))
```

Security boundaries:
- Other users' custom metrics are never returned, even if inactive metrics are requested.
- Inactive default metrics are hidden from clients.
- Inactive custom metrics can be managed/reactivated, but cannot be used for new metric-entry creation.
