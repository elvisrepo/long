# Target-State ERD

## Use When
- Load this when you need the intended completed product data model.
- Use this for subscription, Stripe, wearable sync, audit, and long-term data model planning.

## Scope
- This is a target-state model, not a claim that every table exists today.
- Stripe-facing billing state is separated from application entitlement state.
- Django framework tables such as auth groups, permissions, sessions, admin logs, and JWT token blacklist tables are intentionally omitted.

```mermaid
erDiagram
    USER ||--o{ METRIC_DEFINITION : creates
    USER ||--o{ METRIC_ENTRY : logs
    USER ||--o{ WEARABLE_CONNECTION : connects
    USER ||--o{ SUBSCRIPTION : has
    USER ||--o{ BILLING_CUSTOMER : owns
    USER ||--o{ CHECKOUT_ATTEMPT : starts
    USER ||--o{ AUDIT_LOG : generates

    METRIC_DEFINITION ||--o{ METRIC_ENTRY : defines
    WEARABLE_CONNECTION ||--o{ METRIC_ENTRY : sources
    WEARABLE_CONNECTION ||--o{ SYNC_RUN : runs

    SUBSCRIPTION_PLAN ||--o{ SUBSCRIPTION_PRICE : offers
    SUBSCRIPTION_PLAN ||--o{ SUBSCRIPTION : governs
    SUBSCRIPTION_PRICE ||--o{ CHECKOUT_ATTEMPT : selected
    SUBSCRIPTION_PRICE o|--o{ SUBSCRIPTION : selected
    BILLING_CUSTOMER ||--o{ SUBSCRIPTION : bills
    CHECKOUT_ATTEMPT o|--o{ SUBSCRIPTION : "may activate"
    SUBSCRIPTION ||--o{ STRIPE_WEBHOOK_EVENT : "may be affected by"
    CHECKOUT_ATTEMPT ||--o{ STRIPE_WEBHOOK_EVENT : "may be confirmed by"

    USER {
        uuid id PK
        string email "encrypted"
        string email_lookup_hash UK
        string password_hash
        string first_name "encrypted, nullable"
        string last_name "encrypted, nullable"
        date date_of_birth "encrypted, nullable"
        string timezone
        boolean is_active
        boolean is_staff
        boolean is_superuser
        datetime created_at
        datetime updated_at
    }

    METRIC_DEFINITION {
        uuid id PK
        uuid user_id FK "nullable for system defaults"
        string name
        string slug
        string unit
        string category
        float min_value
        float max_value
        boolean is_default
        boolean is_active
        json metadata
        datetime created_at
        datetime updated_at
    }

    METRIC_ENTRY {
        bigint id PK
        uuid user_id FK
        uuid metric_definition_id FK
        float value
        datetime recorded_at
        string source "manual|provider|csv_import"
        uuid source_connection_id FK "nullable"
        string external_source_id "nullable, dedupe key"
        json context
        datetime created_at
        datetime updated_at
    }

    WEARABLE_CONNECTION {
        uuid id PK
        uuid user_id FK
        string provider "samsung_health|garmin|fitbit|oura|withings"
        string connection_mode "device_bridge|aggregator|direct_cloud"
        string platform "android|ios|server"
        string source_app "health_connect|samsung_health|aggregator"
        string provider_user_id_hash "nullable"
        string aggregator_connection_id "nullable"
        string status "pending|active|error|revoked"
        string sync_cursor "nullable"
        datetime last_synced_at
        datetime last_uploaded_at
        datetime last_webhook_at
        string last_error_code "nullable"
        boolean is_active
        datetime created_at
        datetime updated_at
    }

    SYNC_RUN {
        uuid id PK
        uuid wearable_connection_id FK
        uuid upload_id "unique per connection"
        string status "received|processing|succeeded|partial|failed"
        datetime received_at
        datetime processing_started_at "nullable"
        datetime finished_at "nullable"
        integer entries_imported
        integer entries_skipped
        string error_code
        json error_detail
        json metadata
    }

    SUBSCRIPTION_PLAN {
        uuid id PK
        string code UK "free|pro|premium"
        string name
        integer active_custom_metric_limit
        integer wearable_connection_limit
        integer sync_interval_minutes
        boolean analytics_enabled
        boolean csv_import_enabled
        boolean is_default
        boolean is_active
        datetime created_at
        datetime updated_at
    }

    SUBSCRIPTION_PRICE {
        uuid id PK
        uuid plan_id FK
        string provider "stripe"
        string provider_price_id UK
        string currency
        integer unit_amount "minor currency units"
        string billing_interval "month|year"
        boolean is_active
        datetime created_at
        datetime updated_at
    }

    BILLING_CUSTOMER {
        uuid id PK
        uuid user_id FK
        string provider "stripe"
        string provider_customer_id UK
        datetime created_at
        datetime updated_at
    }

    SUBSCRIPTION {
        uuid id PK
        uuid user_id FK
        uuid plan_id FK
        uuid price_id FK "nullable for free plan"
        uuid billing_customer_id FK "nullable for free plan"
        string provider "stripe|null"
        string provider_subscription_id UK "nullable"
        string status "trialing|active|past_due|cancelled|incomplete"
        datetime current_period_start "nullable"
        datetime current_period_end "nullable"
        boolean cancel_at_period_end
        datetime cancelled_at "nullable"
        datetime created_at
        datetime updated_at
    }

    CHECKOUT_ATTEMPT {
        uuid id PK
        uuid user_id FK
        uuid price_id FK
        string status "pending|completed|failed|expired"
        string provider_checkout_session_id UK "nullable/blank until Stripe creates it"
        datetime created_at
        datetime updated_at
    }

    STRIPE_WEBHOOK_EVENT {
        uuid id PK
        uuid subscription_id FK "nullable"
        uuid checkout_attempt_id FK "nullable"
        string provider_event_id UK
        string event_type
        string processing_status "received|processed|failed"
        json payload
        datetime received_at
        datetime processed_at "nullable"
        string error_message "nullable"
    }

    AUDIT_LOG {
        bigint id PK
        uuid user_id FK
        string action
        string model_name
        string object_id
        json changes
        string ip_address
        datetime created_at
    }
```

## Design Notes
- Stripe is not the entitlement model. Stripe tells us billing state; `SubscriptionPlan` and `Subscription` decide what the app allows.
- `SubscriptionPlan` owns durable product limits such as active custom metrics, wearable connections, and sync cadence.
- `SubscriptionPrice` stores provider price IDs and billing options separately from durable entitlement limits. A plan can have multiple prices, such as monthly and yearly billing.
- `BillingCustomer` isolates provider-specific customer identifiers from user and entitlement logic. Checkout reuses an existing provider customer, while the first verified Checkout completion establishes the mapping and rejects cross-user ownership conflicts.
- `CheckoutAttempt` represents one local user action to start Stripe Checkout. Its UUID is the correct shape for a Stripe idempotency key because retries of that same attempt reuse the same ID, while later deliberate checkout attempts get a new ID.
- `CheckoutAttempt.provider_checkout_session_id` stores the Stripe Checkout Session ID so webhook events and support/debugging can correlate Stripe's `checkout.session.completed` event with the local attempt.
- `StripeWebhookEvent` should be idempotent through `provider_event_id` and can optionally link to a subscription and/or checkout attempt after processing.
- `WearableConnection` supports device-bridge, aggregator, and direct-cloud modes without changing `MetricEntry`.
- `SyncRun` records import attempts separately from imported metric data. Unique `(wearable_connection_id, upload_id)` provides batch-level idempotency, while ownership resolves through the required connection foreign key.
- `AuditLog` is append-only and should store diffs or compact change summaries, not full sensitive snapshots.
