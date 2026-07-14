### 1.4 Core Entities

## Use When
- Load this when you need the core entities, and their relationships.


## Source
- Derived from `reference_docs/knowledge/planning.md` sections 1.4.

**Rationale — how did we decide what to store?**

We derived entities from the functional requirements by asking: *"What data must exist for this feature to work?"*

| Entity | Exists because... | Key design decision |
|---|---|---|
| **User** | Every feature requires knowing *who*. Multi-tenant system — all data is scoped to a user. | PII encrypted at field level. Email stored as ciphertext plus `email_lookup_hash` (HMAC of normalized email) for uniqueness + login lookups. UUID PKs avoid exposing sequential IDs. |
| **MetricDefinition** | Users need to know *what* they can track. System needs validation rules (unit, min/max range) per metric type. | Separated from MetricEntry to avoid duplicating metadata on every data point. `user_id=NULL` for system defaults, FK to user for custom metrics. |
| **MetricEntry** | Core requirement #1 — the actual data points users log. This is where 99% of storage and query load lives. | TimescaleDB hypertable partitioned by `recorded_at` for efficient time-range queries. Denormalized `user_id` for fast row-level filtering. |
| **WearableConnection** | Core requirement #3 — represents a linked device-bridge connection and its state. | The MVP stores the authenticated user, `provider=health_connect`, status, last sync/error state, and timestamps. Samsung Health is sample provenance, not a direct backend connection provider. We do not store raw Samsung Health or Health Connect tokens. |
| **SubscriptionPlan** | Product tiers need durable, backend-owned entitlement values such as custom metric limits, wearable limits, and sync cadence. | Shared plan rows are separate from individual users. Migration `subscriptions.0003` seeds the canonical active default `free` plan. |
| **SubscriptionPrice** | A paid plan can be offered through multiple billing options, such as monthly and yearly prices. | Stores backend-owned provider price IDs, currency, minor-unit amount, billing interval, and active availability separately from plan entitlements. |
| **Subscription** | A user may move between free and paid tiers while retaining subscription history and provider lifecycle state. | Connects a user to one plan and optionally the exact selected price. Free subscriptions have no price; paid subscriptions select a price belonging to their plan. |
| **AuditLog** | GDPR compliance requires knowing who changed what and when. Also useful for debugging and security forensics. | Append-only. Stores diffs (`jsonb changes`), not full snapshots. |

**Relationships & Cardinalities:**

| Relationship | Cardinality | Meaning |
|---|---|---|
| User → MetricEntry | **1 : M** | A user logs many data points. An entry belongs to exactly one user. |
| User → WearableConnection | **1 : M** | A user links multiple sync sources over time. Each connection belongs to one user. |
| User → Subscription | **1 : M** | A user has subscription history (trialing → active → cancelled). Typically one active at a time, but we keep history. |
| SubscriptionPlan → Subscription | **1 : M** | A shared plan can govern many user subscriptions. Each subscription references exactly one plan. |
| SubscriptionPlan → SubscriptionPrice | **1 : M** | A plan can offer multiple billing options. Each price belongs to exactly one plan. |
| SubscriptionPrice → Subscription | **1 : M** (optional from Subscription) | A paid price can be selected by many subscriptions. A free subscription has `price_id=NULL`. |
| User → MetricDefinition | **1 : M** | A user can create custom metrics. System defaults have `user_id=NULL` (shared across all users). |
| User → AuditLog | **1 : M** | A user generates many audit entries. Append-only, never updated. |
| MetricDefinition → MetricEntry | **1 : M** | Each entry is "of" exactly one metric type (e.g., every heart rate reading points to the "Resting Heart Rate" definition). |
| WearableConnection → MetricEntry | **1 : M** (optional) | Entries *can* be sourced from a linked provider connection (`source_connection_id` is nullable). Manual entries have no source connection. |

> The `MetricDefinition → MetricEntry` split is the most important design choice: separating *what a metric is* (definition) from *each recorded value* (entry) gives us clean normalization, per-metric validation rules, and the ability to add custom metrics without schema changes. The second key choice is making `WearableConnection` support both device-bridge sync (Samsung MVP) and future aggregator/cloud integrations without changing the rest of the data model.

**Current wearable-sync status**

- The minimal `WearableConnection` model and authenticated list/create API now exist.
- The implementation stores the authenticated user, provider, connection status, last sync timestamp, last error, and timestamps.
- The initial statuses should support the UI states `connected`, `disconnected`, and `error`.
- The only MVP connection provider is `health_connect`. Samsung Health writes records into Health Connect and will be represented as source-app provenance on uploaded samples.
- The seeded Pro entitlement permits one Health Connect connection; Free permits zero.
- Wearable samples should eventually normalize into `MetricEntry`; do not create a parallel long-term metric storage path.
- Manual entries remain valid and have no source connection.
- The backend should not store raw Samsung Health or Health Connect tokens. The MVP device-bridge model has the Android companion app read on-device data and upload normalized samples.

**Current free-plan behavior**

- Applying migrations creates one shared `SubscriptionPlan(code="free")` row.
- Registration atomically creates the user and one active `Subscription` linked to the shared free plan.
- Users are expected to have exactly one current subscription; missing current subscription data is treated as an integrity problem rather than silently falling back.
- `backfill_free_subscriptions` is a local/staging repair command for users created before the subscription invariant existed; it creates active Free subscriptions for users without any current subscription.
- Trialing, active, past-due, and incomplete subscriptions count as current. Cancelled subscriptions remain historical.
- Metric usage and create/reactivate enforcement resolve limits from the current subscription's plan.
- A plan may have multiple simultaneously active prices when currency or billing interval differs.
- Only one active price is allowed per `(plan, provider, currency, billing_interval)`.
- A subscription's selected price must belong to the same plan; provider price IDs remain backend-owned.
- Paid-plan transitions require an active selected price. Transitions to the default Free plan use `price_id=NULL`.
- Replaced subscriptions retain their selected price as historical billing context.
- A Stripe `customer.subscription.updated` event synchronizes the current paid subscription's `cancel_at_period_end`, `current_period_start`, and `current_period_end`. Scheduling cancellation does not revoke paid entitlements.
- The paid subscription remains current until Stripe reports that it has actually ended through `customer.subscription.deleted`.
- A verified deletion event cancels the paid local subscription and creates a new active Free subscription. The cancelled paid row remains as subscription history.
