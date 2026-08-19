#### Pragmatic MVP Cloud Architecture (Target)

## Use When
- Load this when we are working on the Pragmatic MVP Cloud Architecture.

## Source
- Derived from `reference_docs/knowledge/planning.md` sections 1.9.


The Structurizr DSL is the source of truth for both cloud deployment stages:

- `mvp-staging-deployment`: immediate public HTTPS target
- `mvp-cloud-deployment`: evolved worker-enabled target
- source: `reference_docs/knowledge/diagrams/longevity-architecture.dsl`

### Immediate MVP Staging

```text
Frontend Hosting / CDN
    ↓ serves React assets over HTTPS
Browser
    ↓ calls public API over HTTPS
Public DNS → HTTPS ALB → Django API on ECS Fargate
                              ↓ encrypted PostgreSQL connection
                        Timescale Cloud
                              ↓
                     Managed automated backups

Android staging build
    ↓ public HTTPS API base URL
Public DNS → HTTPS ALB → Django API

Samsung Health → Health Connect → Android staging build

Stripe test mode
    → hosted Checkout / Customer Portal
    → signed public HTTPS webhook

One-off ECS migration task
    → Secrets Manager
    → Timescale Cloud
    → CloudWatch
```

The first staging deployment deliberately omits Celery, Celery Beat, and Redis.
Wearable uploads are authenticated, idempotent, limited to 100 normalized
entries, and processed synchronously. This keeps the initial production-like
topology small while preserving the existing database contracts.

Android no longer uses USB or `adb reverse` in staging. Its staging build uses
an environment-specific base URL such as
`https://api-staging.<domain>/`. The same mobile JWT, subscription-policy,
wearable-connection, and upload contracts continue to apply.

### Evolved Worker-Enabled MVP Cloud

Add the following only when measured server-side workloads require durable
asynchronous execution:

```text
Django API → ElastiCache Redis → Celery Worker
Celery Beat → ElastiCache Redis
Celery Worker → Timescale Cloud / CloudWatch / S3 artifacts
```

Valid triggers include large backfills, expensive analytics, repair jobs,
account exports/deletion, scheduled maintenance, or upload latency that no
longer fits the bounded synchronous request.

### MVP Rules

- Samsung-originated Weight and Steps data is read on device through Health Connect and uploaded by Android.
- Django and Celery cannot directly read Health Connect or wake an offline phone.
- No Samsung cloud webhook or provider-hosted link flow is assumed.
- Managed database backups belong to Timescale Cloud, not to the Django API process.
- Optional logical exports may be written to S3 later by a deliberate scheduled task.
- Schema migrations run as a one-off ECS task before API service promotion.
- The public ALB terminates TLS, routes API and Stripe webhook traffic, and checks `/api/v1/health/`.
- Frontend asset hosting is provider-neutral until provisioning chooses Vercel or S3 plus CloudFront.
