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

Use this flow when reasoning about the `/metrics` catalog and the archived custom metrics UI.

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

Current frontend behavior:
- `/metrics` keeps active definitions in the normal available-metrics list.
- Active rows link to `/metrics/$slug`.
- Archived custom definitions are rendered in a separate bottom section when the user enables `Show deactivated custom metrics`.
- Archived rows are visually muted, show an `Archived` marker, and intentionally do not link to metric detail routes.
- Reactivating an archived metric PATCHes the user's custom metric definition back to `is_active=true`, then TanStack Query invalidates metric-definition and metric-entry caches.

## Custom Metric Reactivation Limit Flow

Use this flow when reasoning about the active custom metric entitlement check during archived custom metric reactivation.

```mermaid
sequenceDiagram
    actor User
    participant UI as Frontend /metrics
    participant API as Django MetricDefinitionDetailView
    participant Serializer as MetricDefinitionSerializer.update()
    participant Limit as validate_active_custom_metric_limit()
    participant DB as PostgreSQL

    Note over DB: Existing state for Alice<br/>Mood active<br/>Sleep Score active<br/>Pain active<br/>Energy inactive

    User->>UI: Click "Reactivate Energy"

    UI->>API: PATCH /api/v1/metrics/definitions/{energy_id}/<br/>Authorization: Bearer token<br/>{ "is_active": true }

    API->>DB: SELECT metric definition<br/>WHERE id = energy_id<br/>AND user_id = alice.id<br/>AND is_default = false

    DB-->>API: Energy metric definition<br/>{ is_active: false }

    API->>Serializer: instance=Energy<br/>validated_data={ "is_active": true }<br/>context.request.user=Alice

    Serializer->>Serializer: is_reactivating =<br/>instance.is_active is false<br/>AND validated_data["is_active"] is true

    Serializer->>Limit: validate_active_custom_metric_limit(<br/>user=Alice,<br/>excluding_definition=Energy<br/>)

    Limit->>DB: Count active custom metrics<br/>WHERE user_id = alice.id<br/>AND is_default = false<br/>AND is_active = true<br/>AND id != energy_id

    DB-->>Limit: count = 3<br/>(Mood, Sleep Score, Pain)

    Limit->>Limit: 3 >= ACTIVE_CUSTOM_METRIC_LIMIT(3)

    Limit-->>Serializer: raise ValidationError<br/>{ "non_field_errors": ["Active custom metric limit reached."] }

    Serializer-->>API: validation error before save

    API-->>UI: 400 Bad Request<br/>{ "non_field_errors": ["Active custom metric limit reached."] }

    UI-->>User: Show "Active custom metric limit reached."

    Note over DB: Final state unchanged<br/>Energy remains inactive
```
