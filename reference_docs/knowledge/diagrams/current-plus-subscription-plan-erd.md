# Current Domain And Subscription ERD

## Use When
- Load this when you need the currently implemented domain and subscription tables.
- Use the target-state ERD separately for planned Stripe, wearable-sync, and audit tables.

## Scope
- `User`, `MetricDefinition`, `MetricEntry`, `SubscriptionPlan`, `SubscriptionPrice`, `Subscription`, `CheckoutAttempt`, and `StripeWebhookEvent` are implemented domain tables.
- Registration creates an explicit active free subscription, and metric limits resolve through the current subscription's plan.
- Django framework tables such as auth groups, permissions, sessions, admin logs, and JWT token blacklist tables are intentionally omitted.

```mermaid
erDiagram
    %% IMPLEMENTED DOMAIN TABLES

    USER o|--o{ METRIC_DEFINITION : "owns custom definitions"
    USER ||--o{ METRIC_ENTRY : logs
    METRIC_DEFINITION ||--o{ METRIC_ENTRY : classifies

    USER {
        uuid id PK
        string email "encrypted"
        string email_lookup_hash UK
        string password
        datetime last_login "nullable"
        boolean is_active
        boolean is_staff
        boolean is_superuser
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
    }

    METRIC_ENTRY {
        bigint id PK
        uuid user_id FK
        uuid metric_definition_id FK
        float value
        datetime recorded_at
        string source
        uuid source_connection_id "nullable, not yet an FK"
        string external_source_id "nullable"
        json context
        datetime created_at
    }

    %% IMPLEMENTED SUBSCRIPTION AND ENTITLEMENT TABLES

    USER ||--o{ SUBSCRIPTION : "has subscription history"
    USER ||--o{ CHECKOUT_ATTEMPT : "starts checkout"
    SUBSCRIPTION_PLAN ||--o{ SUBSCRIPTION : governs
    SUBSCRIPTION_PLAN ||--o{ SUBSCRIPTION_PRICE : "offers billing options"
    SUBSCRIPTION_PRICE o|--o{ SUBSCRIPTION : "selected by"
    SUBSCRIPTION_PRICE ||--o{ CHECKOUT_ATTEMPT : "selected for checkout"

    SUBSCRIPTION_PLAN {
        uuid id PK
        string code UK "free|pro|premium"
        string name
        integer active_custom_metric_limit
        integer sync_interval_minutes
        integer wearable_connection_limit
        boolean analytics_enabled
        boolean csv_import_enabled
        boolean is_default
        boolean is_active
        datetime created_at
        datetime updated_at
    }

    SUBSCRIPTION {
        uuid id PK
        uuid user_id FK
        uuid plan_id FK
        uuid price_id FK "nullable for free subscriptions"
        string status "trialing|active|past_due|cancelled|incomplete"
        string provider "nullable, e.g. stripe"
        string provider_customer_id "nullable"
        string provider_subscription_id UK "nullable"
        datetime current_period_start "nullable"
        datetime current_period_end "nullable"
        boolean cancel_at_period_end
        datetime cancelled_at "nullable"
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

    CHECKOUT_ATTEMPT {
        uuid id PK
        uuid user_id FK
        uuid price_id FK
        string status "pending|completed|confirmed|failed|expired"
        string provider_checkout_session_id "Stripe Checkout Session ID, blank until created"
        datetime created_at
        datetime updated_at
    }

    STRIPE_WEBHOOK_EVENT {
        bigint id PK
        string provider_event_id UK
        string event_type
        datetime processed_at
    }
```

## Constraints And Notes
- Default metric slugs are globally unique where `MetricDefinition.user_id IS NULL`.
- Custom metric slugs are unique per `(user_id, slug)`.
- `MetricEntry.metric_definition_id` uses `PROTECT` so definitions with history are not deleted accidentally.
- `MetricDefinition.user_id` is nullable because system defaults are shared by every user.
- `MetricEntry.user_id` is required because metric data is always owned by exactly one user.
- Migration `subscriptions.0003` seeds one shared active default `free` plan.
- User registration atomically creates one active `Subscription` linked to that plan.
- A conditional unique constraint permits at most one current subscription per user.
- Current statuses are `trialing`, `active`, `past_due`, and `incomplete`; `cancelled` rows are historical.
- Metric usage and enforcement read `active_custom_metric_limit` from the current plan.
- A plan can have multiple active prices for different currencies or billing intervals.
- A conditional unique constraint allows only one active price per `(plan, provider, currency, billing_interval)`.
- `SubscriptionPrice.unit_amount` must be greater than zero.
- `Subscription.price_id` is nullable for free subscriptions and references the exact billing option selected by a paid subscription.
- Application validation requires `Subscription.price.plan_id == Subscription.plan_id`.
- `CheckoutAttempt` represents one user action to start Stripe Checkout for one selected active paid price.
- `CheckoutAttempt.id` is the per-attempt Stripe idempotency key; do not use broad deterministic keys like `(user_id, price_id)` for production retries.
- `CheckoutAttempt.provider_checkout_session_id` stores Stripe's Checkout Session ID, such as `cs_test_...`, after Stripe creates the session. It lets webhook processing and support/debugging link a local attempt to the provider-side Checkout Session.
- `CheckoutAttempt.completed` means the provider Checkout Session was created; `CheckoutAttempt.confirmed` means a verified `checkout.session.completed` webhook reconciled it and changed the local subscription.
- Webhook confirmation requires both the local `CheckoutAttempt.id` from Stripe metadata and the stored `provider_checkout_session_id` to match the event's Checkout Session ID.
- `StripeWebhookEvent.provider_event_id` is unique so duplicate Stripe webhook deliveries cannot reapply a subscription transition.
