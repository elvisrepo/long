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
| **WearableConnection** | Core requirement #3 — represents a linked sync source and its state. | Stores provider, `connection_mode`, platform, `source_app`, optional aggregator identifiers, status, and sync timestamps. MVP uses Android device-bridge sync for Samsung Health. We do not store raw Samsung/Health Connect tokens in the backend. |
| **SubscriptionPlan** | Product tiers need durable, backend-owned entitlement values such as custom metric limits, wearable limits, and sync cadence. | Shared plan rows are separate from individual users. Migration `subscriptions.0003` seeds the canonical active default `free` plan. |
| **Subscription** | A user may move between free and paid tiers while retaining subscription history and provider lifecycle state. | Connects a user to a plan and stores lifecycle/provider state such as active, trialing, past due, or cancelled. A free-plan row is not created for every user. |
| **AuditLog** | GDPR compliance requires knowing who changed what and when. Also useful for debugging and security forensics. | Append-only. Stores diffs (`jsonb changes`), not full snapshots. |

**Relationships & Cardinalities:**

| Relationship | Cardinality | Meaning |
|---|---|---|
| User → MetricEntry | **1 : M** | A user logs many data points. An entry belongs to exactly one user. |
| User → WearableConnection | **1 : M** | A user links multiple sync sources over time. Each connection belongs to one user. |
| User → Subscription | **1 : M** | A user has subscription history (trialing → active → cancelled). Typically one active at a time, but we keep history. |
| SubscriptionPlan → Subscription | **1 : M** | A shared plan can govern many user subscriptions. Each subscription references exactly one plan. |
| User → MetricDefinition | **1 : M** | A user can create custom metrics. System defaults have `user_id=NULL` (shared across all users). |
| User → AuditLog | **1 : M** | A user generates many audit entries. Append-only, never updated. |
| MetricDefinition → MetricEntry | **1 : M** | Each entry is "of" exactly one metric type (e.g., every heart rate reading points to the "Resting Heart Rate" definition). |
| WearableConnection → MetricEntry | **1 : M** (optional) | Entries *can* be sourced from a linked provider connection (`source_connection_id` is nullable). Manual entries have no source connection. |

> The `MetricDefinition → MetricEntry` split is the most important design choice: separating *what a metric is* (definition) from *each recorded value* (entry) gives us clean normalization, per-metric validation rules, and the ability to add custom metrics without schema changes. The second key choice is making `WearableConnection` support both device-bridge sync (Samsung MVP) and future aggregator/cloud integrations without changing the rest of the data model.

**Current free-plan behavior**

- Applying migrations creates one shared `SubscriptionPlan(code="free")` row.
- Registering a user does not create a `Subscription` row automatically.
- The next entitlement-service slice will resolve users without an active subscription to the active default free plan.
- Until that resolver is wired into metric limits, the existing metric entitlement code still uses its temporary hard-coded limit.
