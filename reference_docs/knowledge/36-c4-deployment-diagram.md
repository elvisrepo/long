## 10. C4 Deployment Diagram

## Use When
- Load this when you need the runtime placement views for the immediate public staging target or the evolved worker-enabled MVP cloud target.

## Source
- Derived from `reference_docs/knowledge/06-pragmatic-mvp-cloud-architecture.md` and the Structurizr DSL source of truth.

### Source of Truth

The deployment model is maintained in Structurizr DSL:

- [longevity-architecture.dsl](/home/sevi/longevity/reference_docs/knowledge/diagrams/longevity-architecture.dsl)

### Deployment Views

The Structurizr workspace intentionally maintains two cloud views.

#### `mvp-staging-deployment`

Immediate production-like staging topology:

- browser and internally distributed Android client placement
- provider-neutral frontend hosting/CDN
- public DNS and ACM-backed HTTPS ALB
- Django API on ECS Fargate
- one-off ECS migration task using the same Django image
- Timescale Cloud reached through encrypted PostgreSQL connections
- provider-managed automated database backups
- Secrets Manager
- CloudWatch
- external `/api/v1/health/` monitoring
- Stripe test-mode hosted pages and signed public webhooks

It deliberately omits:

- Celery Worker
- Celery Beat
- ElastiCache Redis

The current bounded wearable endpoint remains synchronous. This is the next
deployment target and its exit condition is a physical Android staging build
synchronizing Weight and Steps through public HTTPS without USB or
`adb reverse`.

#### `mvp-cloud-deployment`

Evolved runtime after measured asynchronous workloads justify queue
infrastructure. It includes everything above plus:

- browser and Android client placement
- frontend hosting/CDN, public DNS, and HTTPS ALB
- Django API on ECS Fargate
- one-off migration task
- Celery worker and beat placement
- ElastiCache Redis
- Timescale Cloud
- managed database backups
- Secrets Manager
- CloudWatch
- S3 for application exports, logical backup artifacts, repair outputs, or media

Both runtime views intentionally do not include:
- GitHub Actions
- ECR
- broader CI/CD pipeline mechanics

Why:
- a C4 deployment diagram is about runtime deployment topology
- CI/CD belongs in delivery architecture, not runtime deployment structure

Android release signing and Play Internal Testing belong in the delivery and
distribution docs. The runtime view begins with the installed Android container
and shows its environment-specific public HTTPS API relationship.

### Current Deployment Modeling Rule

Use the deployment view for:
- where software runs
- what infrastructure or managed services it depends on
- how runtime nodes are arranged

Do not overload it with:
- implementation module details
- request-by-request flow behavior
- CI/CD delivery steps

The deployment views do show the one-off migration task because it executes the
application image against production data and is part of safe runtime promotion,
not because the full CI/CD pipeline belongs in C4.
