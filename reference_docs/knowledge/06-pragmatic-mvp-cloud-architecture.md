#### Pragmatic MVP Cloud Architecture (Target)

## Use When
- Load this when we are working on the Pragmatic MVP Cloud Architecture.

## Source
- Derived from `reference_docs/knowledge/planning.md` sections 1.9.


The Structurizr DSL is the source of truth for the current and future cloud deployment stages:

- `approved-initial-staging`: approved first public staging target with S3, CloudFront, and one EC2 application target
- `approved-initial-staging-compact`: reduced small-screen request path for the approved target
- `mvp-staging-ec2-deployment`: retained proposed two-target staging view
- `mvp-staging-aws-infrastructure`: detailed proposed two-AZ AWS placement and network boundaries
- `post-mvp-fargate-deployment`: later worker-enabled managed-container target
- source: `reference_docs/knowledge/diagrams/longevity-architecture.dsl`

### Approved Initial MVP Staging

```text
Browser → staging.<domain> CloudFront
                         ├── serves React assets over HTTPS
                         │       ↓ private Origin Access Control
                         │   private S3 frontend bucket
                         └── proxies uncached /api/*
                                      ↓ HTTPS
Route53 → ACM-backed ALB across public subnets in AZ-a and AZ-b
                    └── private EC2 App Host A → Gunicorn → Django container A
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

DNS is discovery, not an HTTP request-processing hop. For a browser request to
`staging.<domain>`, the resolver asks Route 53 where that name points and receives
the CloudFront destination. Only then does the browser open TCP, perform TLS
with a nearby CloudFront edge location, and send the HTTP request. Likewise,
`api-staging.<domain>` resolves to the ALB, after which the client opens a
separate TCP/TLS connection to the ALB.

### CloudFront Distribution and Origins

CloudFront belongs to the AWS global edge boundary, not to the frontend origin.
The distribution is global configuration executed across AWS edge locations:
it presents the `staging.<domain>` certificate, selects a path behavior, caches
eligible objects, and reverse-proxies requests. The private S3 bucket in
`eu-central-1` is the static frontend origin. The regional ALB is the API origin.

```text
Route 53 resolves staging.<domain> to CloudFront
Browser → CloudFront distribution
              ├── default/static behavior → private S3 origin
              └── /api/* behavior         → HTTPS ALB origin → EC2 → Django
```

The CloudFront ACM certificate is created in `us-east-1`, but CloudFront
presents it from its global edge network; browser traffic is not redirected to
Virginia. CloudFront chooses an origin from the ordered path behaviors. It does
not understand Django business logic.

### Why Nginx Is Not in Initial Staging

Nginx is a self-managed web server and reverse proxy that can terminate TLS,
serve local static files, and proxy requests to Gunicorn. It is useful when the
application needs server-local files, custom buffering, Unix sockets, or proxy
behavior that the managed edge and load balancer cannot provide.

Initial staging has no such requirement. CloudFront serves and caches the React
build from private S3, while the ALB terminates API TLS, performs health checks,
and forwards to Gunicorn. Adding `ALB → Nginx → Gunicorn → Django` would add a
proxy and maintenance surface without an identified need. Serving React from
Nginx on the only EC2 host would also couple frontend availability and static
traffic to the backend host. Nginx remains a future option, not an approved
initial component.

### Approved Browser Origin

The Android client, Stripe, and external monitoring require a public API
hostname such as `api-staging.<domain>`. For the browser, use one origin:

CloudFront serves `staging.<domain>`, reads React assets from the private S3
origin, and reverse-proxies relative `/api/*` requests to the ALB. This matches
local development, where Vite serves the browser origin and proxies `/api/*` to
Django. It avoids credentialed cross-origin browser configuration for the
current refresh-cookie flow.

The dedicated `api-staging.<domain>` still reaches the same ALB for Android,
Stripe, and monitoring. The DSL now models this strategy. Provisioning remains
blocked until CloudFront's uncached `/api/*` forwarding, cookies, CSRF behavior,
private S3 access, and browser tests are configured and verified.

The first staging deployment deliberately omits Celery, Celery Beat, and Redis.
Wearable uploads are authenticated, idempotent, limited to 100 normalized
entries, and processed synchronously. This keeps the initial production-like
topology small while preserving the existing database contracts.

The approved initial topology registers one private EC2 application host in the
ALB target group. The ALB still spans two public subnets, but the application is
not initially highly available. Add EC2 App Host B in the second Availability
Zone later to learn health-based routing and failover without changing DNS, the
ALB, API routes, or clients. The retained two-target C4 view shows that expansion.

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
- The public ALB terminates TLS, routes API and Stripe webhook traffic, and uses
  `GET /api/v1/health/ready/` to route only to targets that can query
  PostgreSQL. External uptime monitoring uses the database-independent
  `GET /api/v1/health/live/` contract.
- Public DNS locates the ALB; the ACM-backed ALB listener, not DNS, is the TLS endpoint.
- The approved ALB spans two public subnets and initially routes to one private Django target; a second target is deferred.
- EC2 has no public SSH ingress; IAM-authorized Systems Manager sessions use the agents' outbound management channels.
- CloudFront serves `staging.<domain>`, reads React assets from a private S3 bucket through Origin Access Control, and forwards uncached `/api/*` requests to the ALB.
- CloudFront uses a viewer certificate in `us-east-1`; the ALB uses a separate regional certificate in `eu-central-1` for `api-staging.<domain>`.
- Manual staging provisioning is a learning phase, not the production source of truth; Terraform should reproduce the EC2 topology before production promotion.
