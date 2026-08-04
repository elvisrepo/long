## 9. C4 Container Diagram

## Use When
- Load this when you need the high-level runtime/container view of the current system: the main client applications, backend runtime pieces, supporting data stores, and the main relationships between them.

## Source
- Derived from `reference_docs/knowledge/05-local-development-architecture.md`, `reference_docs/knowledge/06-pragmatic-mvp-cloud-architecture.md`, `reference_docs/knowledge/12-current-local-docker-runtime.md`, and the current repository implementation.

### Purpose

This is the C4 Container-level view for the project.

It answers:
- what the main runtime pieces are
- how web and Android reach the backend
- where background work lives
- which storage/services the backend depends on

### Source of Truth

The C4 container model is now maintained in Structurizr DSL:

- [longevity-architecture.dsl](/home/sevi/longevity/reference_docs/knowledge/diagrams/longevity-architecture.dsl)

Use that DSL file as the source of truth for the container view and future C4 views.

### Current Container Scope

Current container view includes:
- User
- React Web App
- Android Companion App
- Django API
- Celery Worker
- Celery Beat
- PostgreSQL / TimescaleDB
- Redis
- Samsung Health / Health Connect

### Scope Notes

- This is a container-level architecture view, not a deployment diagram.
- It intentionally shows the main runtime pieces, not every module or Django app.
- The implemented React web app is a distinct browser-executed client container with registration/login, protected Dashboard and Metrics routes, and Stripe-backed Settings flows.
- The Android companion app is a first-class container because Samsung sync is client-mediated in the MVP design.
- Samsung Health data does not flow directly into the backend in MVP. It is read on device, then uploaded by the Android app.
- GitHub Actions is intentionally not part of this C4 container view because it belongs to the delivery pipeline, not the runtime system.

### Relationship Notes

- Web uses the backend through the explicit web auth/API contract.
- Android uses the same backend service through the explicit mobile auth/API contract.
- Django handles request/response work and enqueues or coordinates async work.
- Celery Worker executes asynchronous jobs.
- Celery Beat schedules recurring jobs.
- PostgreSQL / TimescaleDB is the system of record.
- Redis is used for broker/cache-style infrastructure concerns around Celery and future background coordination.

### Component Views

The Structurizr workspace now contains two focused component views because both client and backend boundaries have stabilized:

- `c4-web-components`: Routes/Screens, Web Auth Session, and TanStack Query Server State.
- `c4-api-components`: Authentication, Subscriptions/Billing, Metrics, and Wearables.

These are responsibility maps, not class or file-tree diagrams. Database entities remain in the ERD source documents.

### What These Diagrams Do Not Cover

- Class/function-level implementation details.
- Database entity attributes and constraints.
- Delivery pipeline concerns such as GitHub Actions.
- Health Connect record mapping details, which remain in the wearable ingestion data-flow documentation.

### Current Dynamic View Scope

Current dynamic views cover implemented behavior across:
- web auth login
- web auth refresh
- web auth logout
- web current-user bootstrap and protected-route access
- Dashboard/manual metric entry
- metric catalog/detail/history management
- custom metric entitlement locking
- Stripe Checkout, Portal, webhook, scheduled-cancellation, reversal, and terminal-downgrade flows
- implemented backend wearable connection lifecycle
- the Free-to-Pro-to-pending-Health-Connect state transition

Health Connect device reads and Android upload calls remain planned and should not be shown as completed traffic until the physical-device slice passes.
