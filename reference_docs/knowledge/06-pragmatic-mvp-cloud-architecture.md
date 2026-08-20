#### Pragmatic MVP Cloud Architecture (Target)

## Use When
- Load this when we are working on the Pragmatic MVP Cloud Architecture.

## Source
- Derived from `reference_docs/knowledge/planning.md` sections 1.9.


The Structurizr DSL is the source of truth for the current and future cloud deployment stages:

- `mvp-staging-ec2-deployment`: immediate manually provisioned public HTTPS target
- `post-mvp-fargate-deployment`: later worker-enabled managed-container target
- source: `reference_docs/knowledge/diagrams/longevity-architecture.dsl`

### Immediate MVP Staging

```text
Frontend Hosting / CDN
    ↓ serves React assets over HTTPS
Browser
    ↓ calls public API over HTTPS
Public DNS → HTTPS ALB → EC2 Application Host
                              └── Docker
                                  └── Django API container
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

One-off Docker migration container on EC2
    → Secrets Manager
    → Timescale Cloud
    → CloudWatch
```

The first staging deployment deliberately omits Celery, Celery Beat, and Redis.
Wearable uploads are authenticated, idempotent, limited to 100 normalized
entries, and processed synchronously. This keeps the initial production-like
topology small while preserving the existing database contracts.

The first EC2 staging environment is provisioned manually so the developer
learns Route53, ACM, ALB target groups and health checks, EC2, security groups,
IAM roles, Systems Manager, Secrets Manager, and CloudWatch directly. Every
manual step must be recorded in a deployment runbook. Before real production
users are accepted, reproduce the same EC2 topology with Terraform so the
server is recoverable rather than a one-off snowflake.

Android no longer uses USB or `adb reverse` in staging. Its staging build uses
an environment-specific base URL such as
`https://api-staging.<domain>/`. The same mobile JWT, subscription-policy,
wearable-connection, and upload contracts continue to apply.

### Post-MVP Fargate Target

After operating the Terraform-managed EC2 MVP, migrate the API and operational
commands to ECS Fargate to learn managed container deployment. Add queue
infrastructure only when measured server-side workloads require durable
asynchronous execution:

```text
Django API → ElastiCache Redis → Celery Worker
Celery Beat → ElastiCache Redis
Celery Worker → Timescale Cloud / CloudWatch / S3 artifacts
```

Valid triggers include large backfills, expensive analytics, repair jobs,
account exports/deletion, scheduled maintenance, or upload latency that no
longer fits the bounded synchronous request.

Workers, Beat, migrations, and artifact-producing jobs are not Fargate-only.
They can run as ordinary containers on EC2. Fargate is the selected post-MVP
compute platform; ECR stores immutable container images, CloudWatch stores logs,
and durable runtime artifacts such as exports or logical backups belong in S3.

### MVP Rules

- Samsung-originated Weight and Steps data is read on device through Health Connect and uploaded by Android.
- Django and Celery cannot directly read Health Connect or wake an offline phone.
- No Samsung cloud webhook or provider-hosted link flow is assumed.
- Managed database backups belong to Timescale Cloud, not to the Django API process.
- Optional logical exports may be written to S3 later by a deliberate scheduled task.
- On EC2, schema migrations run once through the same backend image with `docker compose run --rm web uv run python manage.py migrate --no-input` before the API container is replaced.
- On post-MVP Fargate, the equivalent operation is a one-off ECS task using the same immutable image.
- The public ALB terminates TLS, routes API and Stripe webhook traffic, and checks `/api/v1/health/`.
- Frontend asset hosting is provider-neutral until provisioning chooses Vercel or S3 plus CloudFront.
- Manual staging provisioning is a learning phase, not the production source of truth; Terraform should reproduce the EC2 topology before production promotion.
