# Current Database Plus Subscription Plan ERD

## Use When
- Load this when you need the implemented domain tables plus the next planned subscription/entitlement slice.
- Use this before implementing subscription models so current tables are not confused with planned tables.

## Scope
- `User`, `MetricDefinition`, and `MetricEntry` are implemented domain tables.
- `SubscriptionPlan` and `Subscription` are the next planned entitlement tables.
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

    %% NEXT PLANNED SUBSCRIPTION AND ENTITLEMENT TABLES

    USER ||--o{ SUBSCRIPTION : "has subscription history"
    SUBSCRIPTION_PLAN ||--o{ SUBSCRIPTION : governs

    SUBSCRIPTION_PLAN {
        uuid id PK
        string code UK "free|pro|premium"
        string name
        integer active_custom_metric_limit
        integer sync_interval_minutes
        integer wearable_connection_limit
        boolean is_default
        boolean is_active
        datetime created_at
        datetime updated_at
    }

    SUBSCRIPTION {
        uuid id PK
        uuid user_id FK
        uuid plan_id FK
        string status "trialing|active|past_due|cancelled"
        string billing_provider "nullable, e.g. stripe"
        string provider_customer_id "nullable"
        string provider_subscription_id UK "nullable"
        datetime current_period_start "nullable"
        datetime current_period_end "nullable"
        boolean cancel_at_period_end
        datetime created_at
        datetime updated_at
    }
```

## Constraints And Notes
- Default metric slugs are globally unique where `MetricDefinition.user_id IS NULL`.
- Custom metric slugs are unique per `(user_id, slug)`.
- `MetricEntry.metric_definition_id` uses `PROTECT` so definitions with history are not deleted accidentally.
- `MetricDefinition.user_id` is nullable because system defaults are shared by every user.
- `MetricEntry.user_id` is required because metric data is always owned by exactly one user.
- Users without an active paid subscription should resolve to the default free plan.
