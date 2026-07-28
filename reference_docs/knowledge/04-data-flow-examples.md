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

## Free to Pro to Health Connect Data-State Timeline

Use this timeline when reasoning about which durable rows change as a newly registered Free user purchases Pro monthly and then registers Health Connect.

Example identifiers:

```text
U1         = user UUID
PLAN_FREE  = Free SubscriptionPlan UUID
PLAN_PRO   = Pro SubscriptionPlan UUID
PRICE_PRO  = Pro monthly SubscriptionPrice UUID
SUB_FREE   = original Free Subscription UUID
SUB_PRO    = replacement Pro Subscription UUID
ATTEMPT_1  = CheckoutAttempt UUID
CONN_1     = WearableConnection UUID
```

| Step | Event | Rows inserted | Rows updated | Resulting state |
|---:|---|---|---|---|
| 0 | Product configuration exists | `SubscriptionPlan(free)`, `SubscriptionPlan(pro)`, and active Pro monthly/yearly `SubscriptionPrice` rows | — | Free permits zero wearable connections; Pro permits one Health Connect connection |
| 1 | User registers | `User(U1)` and `Subscription(SUB_FREE, plan=free, status=active, price=NULL)` | — | `SUB_FREE` is the user's only current subscription |
| 2 | Django creates a Stripe Checkout Session | `CheckoutAttempt(ATTEMPT_1, price=PRICE_PRO, expected_subscription=SUB_FREE, status=pending)` | `ATTEMPT_1` becomes `completed` and stores `cs_test_...` after Stripe returns a hosted URL | Free remains active; no entitlement changes based on the browser redirect |
| 3 | Verified `checkout.session.completed` arrives | `StripeWebhookEvent(evt_checkout_...)`, `BillingCustomer(U1, cus_test_...)`, and `Subscription(SUB_PRO, plan=pro, price=PRICE_PRO, status=active, provider_subscription_id=sub_test_...)` | `SUB_FREE` becomes `cancelled`; `ATTEMPT_1` becomes `confirmed` | Pro becomes the only current subscription; Free remains as history |
| 4 | Verified `customer.subscription.updated` arrives | `StripeWebhookEvent(evt_subscription_...)` | `SUB_PRO` receives recognized price/plan data, current-period dates, and normalized cancellation state | Local billing dates and price match Stripe |
| 5 | User registers Health Connect | `WearableConnection(CONN_1, user=U1, provider=health_connect, status=pending, is_active=true)` | — | Active wearable usage becomes `1 / 1`; registration does not yet claim a successful sync |
| 6 | First upload receipt — implemented | `SyncRun(connection=CONN_1, upload_id=UPLOAD_1, status=received)` | — | The first request returns `201`; retrying `(CONN_1, UPLOAD_1)` returns the same receipt with `200` |
| 7 | First normalized sample ingestion — isolated happy path implemented; endpoint wiring planned | Wearable-sourced `MetricEntry` rows | `SyncRun` stores its payload hash, reaches `succeeded`, and records the imported count; `CONN_1` becomes `connected` and receives `last_synced_at` | The service writes one validated new batch atomically; retry comparison and duplicate-record skipping remain next |

Important final-state properties:

- `Subscription` contains two rows: historical cancelled Free and current active Pro.
- `BillingCustomer` is the authoritative local mapping from `U1` to Stripe `cus_test_...`.
- `StripeWebhookEvent` is the provider-event idempotency ledger.
- `WearableConnection.status=pending` means registration succeeded but no trusted ingestion has proven the bridge works yet.
- Connecting Health Connect alone creates no `MetricEntry` rows.
- The `SyncRun` receipt model, database idempotency constraint, receipt-only upload endpoint, and isolated synchronous-ingestion happy path are implemented. The endpoint still rejects entries until retry comparison and duplicate-record handling make the full path safe.

## Free to Pro to Health Connect Sequence

The sequence shows runtime ordering; the timeline above remains the clearer source for row-level state changes.

```mermaid
sequenceDiagram
    actor User
    participant Web as React Web App
    participant API as Django API
    participant Stripe
    participant DB as PostgreSQL / TimescaleDB
    participant Android as Android Companion App

    User->>Web: Register account
    Web->>API: POST /api/auth/register/
    API->>DB: INSERT User(U1) + active Free Subscription(SUB_FREE)
    API-->>Web: 201 with registered email
    User->>Web: Sign in
    Web->>API: POST /api/auth/web/login/
    API->>DB: Authenticate U1
    API-->>Web: 200 access token + HttpOnly refresh cookie

    User->>Web: Select Pro monthly
    Web->>API: POST /api/v1/subscriptions/checkout/ with price_id=PRICE_PRO
    API->>DB: INSERT CheckoutAttempt(pending, expected_subscription=SUB_FREE)
    API->>Stripe: Create Checkout Session with server-owned price and attempt idempotency key
    Stripe-->>API: cs_test_... + hosted Checkout URL
    API->>DB: UPDATE CheckoutAttempt status=completed, session=cs_test_...
    API-->>Web: 201 with hosted URL
    Web->>Stripe: Redirect browser
    User->>Stripe: Complete hosted payment

    Stripe->>API: Signed checkout.session.completed webhook
    API->>DB: INSERT unique StripeWebhookEvent
    API->>DB: Cancel SUB_FREE, insert active SUB_PRO and BillingCustomer, confirm attempt
    API-->>Stripe: 200 acknowledgement

    Stripe->>API: Signed customer.subscription.updated webhook
    API->>DB: INSERT unique StripeWebhookEvent
    API->>DB: UPDATE SUB_PRO price, period dates, and cancellation state
    API-->>Stripe: 200 acknowledgement

    User->>Android: Choose Connect Health Connect
    Android->>API: POST /api/v1/wearables/connections/ with provider=health_connect
    API->>DB: Lock U1, load active Pro plan, count active connections
    API->>DB: INSERT active WearableConnection(CONN_1, status=pending)
    API-->>Android: 201 pending connection

    Note over Android,DB: No MetricEntry exists until the future authenticated ingestion flow succeeds.
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
