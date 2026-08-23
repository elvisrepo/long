#### Pragmatic MVP Cloud Architecture (Target)

## Use When
- Load this when we are working on the Pragmatic MVP Cloud Architecture.

## Source
- Derived from `reference_docs/knowledge/planning.md` sections 1.9.


The Structurizr DSL is the source of truth for the current and future cloud deployment stages:

- `mvp-staging-ec2-deployment`: immediate manually provisioned public HTTPS target
- `mvp-staging-aws-infrastructure`: detailed proposed two-AZ AWS placement and network boundaries
- `post-mvp-fargate-deployment`: later worker-enabled managed-container target
- source: `reference_docs/knowledge/diagrams/longevity-architecture.dsl`

### Immediate MVP Staging

```text
Browser → staging.<domain> Frontend Hosting / CDN
                         ├── serves React assets over HTTPS
                         └── reverse-proxies uncached /api/*
                                      ↓ HTTPS
Route53 → ACM-backed ALB across public subnets in AZ-a and AZ-b
                    ├── private EC2 App Host A → Django container A
                    └── private EC2 App Host B → Django container B
                                      ↓ encrypted PostgreSQL
                                Timescale Cloud → managed backups

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

### DNS, TLS, ACM, and ALB Boundary

Public DNS and TLS solve different problems. Route53 publishes an alias such as
`api-staging.<domain>` that tells internet clients how to reach the ALB; DNS does
not encrypt or route the HTTP request. The ALB's port-443 listener is the public
TLS endpoint. It presents the hostname-matching ACM certificate, authenticates
the server to the client, and negotiates encryption that protects passwords,
tokens, health data, API responses, and Stripe webhooks in transit.

The ALB terminates the client TLS connection, decrypts the request, checks the
target's health, and forwards the request to Django on EC2. For this MVP the
ALB-to-EC2 application hop is HTTP inside the AWS network boundary. The EC2
security group must therefore accept the application port only from the ALB
security group. Django trusts `X-Forwarded-Proto: https` only within that
boundary so `request.is_secure()`, HTTPS redirects, and Secure cookies behave
correctly. ACM keeps the certificate and private key on the AWS-managed edge
and handles eligible certificate renewal instead of placing TLS keys on EC2.

### Recommended Browser Origin

The Android client, Stripe, and external monitoring require a public API
hostname such as `api-staging.<domain>`. For the browser, use one origin:

`staging.<domain>` serves React and reverse-proxies relative `/api/*` requests
to the ALB. This matches local development, where Vite serves the browser origin
and proxies `/api/*` to Django. It avoids credentialed cross-origin browser
configuration for the current refresh-cookie flow.

The dedicated `api-staging.<domain>` still reaches the same ALB for Android,
Stripe, and monitoring. The DSL now models this strategy. Provisioning remains
blocked until the frontend provider and its uncached `/api/*` forwarding,
cookies, CSRF behavior, and browser tests are configured and verified.

The first staging deployment deliberately omits Celery, Celery Beat, and Redis.
Wearable uploads are authenticated, idempotent, limited to 100 normalized
entries, and processed synchronously. This keeps the initial production-like
topology small while preserving the existing database contracts.

The proposed learning topology uses two private EC2 application hosts, one in
each of two Availability Zones, behind one ALB target group. This makes ALB
health routing and single-target failure observable. It costs more than the
original single-host decision: compute and EBS are duplicated, and a zonal NAT
Gateway in each public subnet adds fixed and data-processing charges. Run a
cost estimate before provisioning; one host remains an acceptable lower-cost
fallback, but it is a single point of failure and cannot demonstrate failover.

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

Android and React are separate clients of the public Django API:

```text
Android staging build
    → public API hostname over HTTPS
    → Route53
    → ALB :443
    → Django container on EC2
    → Timescale Cloud

React browser
    → relative /api/* on staging.<domain>
    → frontend/CDN reverse proxy
    → the same public Django API ALB
    → reads the metric state written by Android uploads
```

Android does not call React and does not receive AWS, database, Django, or
Stripe server credentials. It reads Health Connect locally, authenticates with
the existing mobile JWT flow, and sends normalized batches through OkHttp.
Planned application identities are `.debug`, `.staging`, and the unsuffixed
production ID so local, staging, and release data and permissions remain
isolated. Staging can begin with a directly installed signed APK and then move
to Play Internal Testing; distribution does not change the runtime API route.

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
- Public DNS locates the ALB; the ACM-backed ALB listener, not DNS, is the TLS endpoint.
- The proposed ALB spans two public subnets; its two Django targets occupy private application subnets in different Availability Zones.
- EC2 has no public SSH ingress; IAM-authorized Systems Manager sessions use the agents' outbound management channels.
- Frontend asset hosting is provider-neutral until provisioning chooses Vercel or S3 plus CloudFront.
- Manual staging provisioning is a learning phase, not the production source of truth; Terraform should reproduce the EC2 topology before production promotion.
