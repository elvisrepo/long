## 10. C4 Deployment Diagram

## Use When
- Load this when you need the current low-cost presentation-staging placement,
  the recommended resilient production placement, or a clearly marked historical
  deployment view for comparison.

## Source
- Derived from `reference_docs/knowledge/06-pragmatic-mvp-cloud-architecture.md` and the Structurizr DSL source of truth.

### Source of Truth

The deployment model is maintained in Structurizr DSL:

- [longevity-architecture.dsl](/home/sevi/longevity/reference_docs/knowledge/diagrams/longevity-architecture.dsl)

Validate it with Structurizr's current consolidated image:

```bash
cd reference_docs/knowledge/diagrams
docker run --rm \
  -v "$PWD:/usr/local/structurizr:ro" \
  structurizr/structurizr \
  validate -workspace /usr/local/structurizr/longevity-architecture.dsl
```

Do not use `structurizr/cli:latest`. That deprecated image currently prints a
migration warning and exits successfully without parsing the workspace, which
can create false confidence around invalid DSL.

### Deployment View Status

The workspace keeps current, recommended, and historical cloud models as
separate deployment environments. The label is part of both the environment
name and the view description so exported diagrams remain distinguishable.

| View key | Status | Meaning |
|---|---|---|
| `current-presentation-staging` | **CURRENT** | Full provisioning source of truth for the agreed low-cost presentation environment |
| `current-presentation-staging-compact` | **CURRENT / COMPACT** | Small request-and-data-path view of the same current staging environment |
| `recommended-production` | **RECOMMENDED PRODUCTION** | Resilient production architecture recommendation; not the current staging bill of materials |
| `recommended-production-compact` | **RECOMMENDED PRODUCTION / COMPACT** | Small request-and-data-path view of the same production recommendation |
| `approved-initial-staging` | **LEGACY / SUPERSEDED** | Former ALB, NAT Gateway, one-private-EC2, and Timescale Cloud staging decision |
| `approved-initial-staging-compact` | **LEGACY / SUPERSEDED** | Compact form of the former approved staging decision |
| `mvp-staging-ec2-deployment` | **LEGACY / SUPERSEDED** | Former two-private-EC2 and ALB staging proposal |
| `mvp-staging-aws-infrastructure` | **LEGACY / SUPERSEDED** | Detailed network form of the former two-target proposal |
| `post-mvp-fargate-deployment` | **LEGACY / SUPERSEDED** | Former broad Fargate, Redis, Celery, and Timescale Cloud target |

Legacy views are retained for architectural history and comparison. They do not
authorize provisioning and must not be mistaken for the current staging target.

#### `current-presentation-staging`

This is the current manually provisioned presentation-staging target:

- `staging.<domain>` aliases to one CloudFront distribution
- private S3 stores the Vite/React build behind Origin Access Control
- the default behavior caches static assets and handles SPA routes
- uncached `/api/*` requests go to `origin-staging.<domain>`
- an Elastic IP maps that origin hostname to one public `t4g.small` EC2 host
- the EC2 security group accepts TCP 443 only from CloudFront's managed
  origin-facing prefix list; TCP 22, 8000, and 5432 remain closed
- CloudFront adds a secret origin header that Nginx must validate
- Nginx terminates the CloudFront-to-origin TLS connection using an automated
  Let's Encrypt DNS-01 certificate
- Nginx proxies through the private Docker network to Gunicorn, which invokes
  Django through WSGI
- the same EC2 host runs a PostgreSQL/TimescaleDB 16 container; Timescale-specific
  capabilities remain unused
- encrypted gp3 EBS persists PostgreSQL data and certificate state
- a scheduled backup container runs `pg_dump` and uploads encrypted logical
  backups to a separate private S3 bucket
- the staging runtime loader retrieves one Secrets Manager JSON snapshot and
  injects the same validated snapshot into the migration and API containers
- Systems Manager provides administration without public SSH
- CloudWatch receives application, migration, backup, infrastructure, and
  certificate-expiry signals
- migrations run in a one-off container before API replacement
- ALB, NAT Gateway, Timescale Cloud, Redis, Celery Worker, and Celery Beat are
  intentionally absent

The host is a deliberate single point of failure and API replacement can cause
brief downtime. Those are accepted presentation-environment tradeoffs, not
production availability claims.

#### `current-presentation-staging-compact`

This view retains only the important request and persistence path:

```text
Browser or Android
    -> CloudFront
       -> private S3 for React
       -> Nginx for /api/*
          -> Gunicorn / Django
             -> PostgreSQL / TimescaleDB on encrypted EBS
```

It omits DNS, certificates, security groups, migrations, runtime loading,
Systems Manager, CloudWatch, backup execution, Stripe, and uptime monitoring.
Those remain in the full current view.

#### `recommended-production`

This is the recommended architecture after real production availability and
recovery requirements justify the cost:

- CloudFront, AWS WAF, private S3, and the same-origin browser `/api/*` contract
- ACM viewer certificate in `us-east-1`
- regional ACM-backed HTTPS ALB in `eu-central-1`
- two private ECS Fargate Gunicorn/Django tasks across two Availability Zones
- ALB readiness checks and IP target routing
- one-off Fargate migration task using the same immutable image
- private Amazon RDS PostgreSQL Multi-AZ with synchronous standby, automatic
  failover, encrypted backups, and point-in-time recovery
- separate ALB, API-task, and database security groups
- zonal NAT Gateways for private-task outbound access
- Secrets Manager task injection and CloudWatch deployment rollback signals
- no Nginx because the ALB owns production TLS termination and proxying
- no Redis, Celery Worker, or Celery Beat until measured workloads require them

#### `recommended-production-compact`

```text
Browser
    -> CloudFront / WAF
       -> private S3
       -> HTTPS ALB
          -> healthy Fargate task A or B
             -> RDS PostgreSQL Multi-AZ
```

Android, Stripe webhooks, and uptime monitoring use `api.<domain>` and reach the
same ALB directly.

#### Retained legacy views

The five legacy keys preserve the previously discussed ALB/NAT/Timescale Cloud
staging options and the older Fargate/Redis/Celery target. Their element names
and relationships remain available for comparison. Each deployment environment
and view description is explicitly prefixed `[LEGACY / SUPERSEDED]`.

All runtime views intentionally omit GitHub Actions, ECR, and broader CI/CD
mechanics. C4 deployment views describe runtime placement; delivery automation
belongs in delivery architecture. The one-off migration container/task remains
because it executes the application image against persistent state as part of
safe promotion.

### Android View Mapping

Use `current-presentation-staging` to see the physical hosted route:

```text
Android staging container instance
    → staging.<domain>
    → CloudFront /api/* behavior
    → HTTPS Nginx on EC2
    → Gunicorn / Django container
    → PostgreSQL / TimescaleDB container on the same EC2 host
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

### Reading the Public Edge

DNS discovery and request transport are separate. Route 53 answers where a
hostname points; it does not receive or proxy the HTTP request. In current
presentation staging, Route 53 resolves `staging.<domain>` to CloudFront. Browser,
Android, Stripe webhook, and uptime-monitoring traffic enters through that
CloudFront endpoint. `origin-staging.<domain>` exists for CloudFront's custom
origin lookup, not as an unrestricted public API endpoint.

`AWS Global Edge` contains the logical CloudFront distribution endpoint, its
static and `/api/*` behaviors, SPA rewrite, and viewer-certificate boundary.
CloudFront is not the frontend origin: private S3 in `eu-central-1` is the static
origin. Nginx on the EC2 host is the current API origin. The `us-east-1` ACM
resource supplies the CloudFront viewer certificate; Let's Encrypt supplies the
separate Nginx origin certificate through automated Route 53 DNS-01 validation.

CloudFront sends default/static paths to private S3 and uncached `/api/*` paths
to Nginx over HTTPS. Nginx validates the secret origin header and proxies to
Gunicorn/Django over the private Docker network. In recommended production, the
API origin changes from Nginx to the ALB and Android/Stripe/monitoring use the
dedicated `api.<domain>` ALB hostname.

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
