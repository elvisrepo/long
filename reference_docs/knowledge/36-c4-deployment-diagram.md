## 10. C4 Deployment Diagram

## Use When
- Load this when you need the runtime placement views for the immediate manual-EC2 staging target or the post-MVP Fargate target.

## Source
- Derived from `reference_docs/knowledge/06-pragmatic-mvp-cloud-architecture.md` and the Structurizr DSL source of truth.

### Source of Truth

The deployment model is maintained in Structurizr DSL:

- [longevity-architecture.dsl](/home/sevi/longevity/reference_docs/knowledge/diagrams/longevity-architecture.dsl)

### Deployment Views

The Structurizr workspace intentionally maintains two cloud views.

#### `mvp-staging-ec2-deployment`

Immediate production-like staging topology:

- browser and internally distributed Android client placement
- provider-neutral frontend hosting/CDN
- public DNS and ACM-backed HTTPS ALB
- manually provisioned EC2 application host using Docker Engine and Compose
- long-lived Django API container on EC2
- one-off Docker migration container using the same immutable image
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

Manual provisioning is a learning phase. Every step belongs in a runbook, and
the same EC2 topology should be reproduced with Terraform before production so
the server is recoverable rather than a configuration snowflake.

#### `post-mvp-fargate-deployment`

Post-MVP runtime after the EC2 and Terraform learning phases. It moves compute
to Fargate and adds queue infrastructure only after measured asynchronous
workloads justify it:

- browser and Android client placement
- frontend hosting/CDN, public DNS, and HTTPS ALB
- Django API on ECS Fargate
- one-off migration task
- Celery Worker service and exactly one Beat scheduler
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

Android build flavors, release signing, and Play Internal Testing belong in the delivery and
distribution docs. The runtime view begins with the installed Android container
and shows its environment-specific public HTTPS API relationship.

### Android View Mapping

Use `mvp-staging-ec2-deployment` to see the physical hosted route:

```text
Android staging container instance
    → Public DNS
    → HTTPS ALB
    → Django container instance on EC2
    → Timescale Cloud
```

The Android container is a peer client of the React container; it never routes
through React or accesses the database directly. Samsung Health and Health
Connect remain on the physical phone.

Use these dynamic views for application-level behavior that intentionally
abstracts away DNS, ALB, and EC2 placement:

- `mobile-auth-login`
- `mobile-auth-refresh-retry`
- `wearable-connection-register`
- `mobile-manual-weight-sync-coordinator` (legacy key; live behavior is Weight plus Steps)
- `mobile-periodic-weight-sync` (legacy key; live behavior is Weight plus Steps)

The deployment view answers where network traffic runs. The dynamic views
answer which Android and Django responsibilities collaborate during each flow.

### Current Deployment Modeling Rule

Use the deployment view for:
- where software runs
- what infrastructure or managed services it depends on
- how runtime nodes are arranged

Do not overload it with:
- implementation module details
- request-by-request flow behavior
- CI/CD delivery steps

The deployment views do show the one-off migration container/task because it
executes the application image against persistent data and is part of safe
runtime promotion, not because the full CI/CD pipeline belongs in C4. On EC2 it
is a temporary Docker Compose run; on Fargate it is a temporary ECS task.
