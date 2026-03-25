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
- The web app is represented as a distinct client container even though it is not scaffolded in the repo yet, because it is the planned next major slice.
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

### What This Diagram Does Not Cover

- Internal backend module boundaries such as users, metrics, wearables, and analytics.
- Detailed request ordering for auth, metric logging, or sync flows.
- Cloud deployment specifics such as ALB, ECS, Secrets Manager, or CloudWatch.
- Delivery pipeline concerns such as GitHub Actions.

Use separate diagrams for those:
- component diagram for backend internals
- sequence diagrams for auth and sync flows
- deployment diagram for cloud/runtime placement later

### When To Add A C4 Component Diagram

Do not add a component diagram too early.

It becomes worth adding when:
- one container has enough internal structure that people repeatedly need an internal map
- module responsibilities are stabilizing
- the diagram would help implementation or review decisions

For this project, a backend component diagram becomes useful once the Django API has clearer internal module boundaries such as:
- users/auth
- metrics
- wearables ingestion
- analytics
- common/tasks

Until then:
- keep the context and container diagrams
- prefer sequence diagrams for important flows
- avoid a premature component diagram that would mostly restate a small file tree and go stale quickly
