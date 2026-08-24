## 10. C4 Deployment Diagram

## Use When
- Load this when you need the runtime placement views for the immediate manual-EC2 staging target or the post-MVP Fargate target.

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

### Deployment Views

The Structurizr workspace intentionally maintains four cloud views.

#### `approved-initial-staging`

The approved first public staging topology:

- one browser origin at `staging.<domain>` through CloudFront
- private S3 React origin protected by CloudFront Origin Access Control
- cached static/SPA behavior and uncached `/api/*` behavior
- `api-staging.<domain>` routed to the ALB for CloudFront, Android, Stripe, and monitoring
- CloudFront ACM certificate in `us-east-1` and ALB ACM certificate in `eu-central-1`
- internet-facing ALB across two public subnets
- one private EC2/Django target and one one-off migration container initially
- Gunicorn as the production WSGI process between the ALB target group and Django
- one NAT Gateway for the initial private application subnet
- Systems Manager administration without public SSH
- Timescale Cloud, managed backups, Secrets Manager, CloudWatch, Stripe, and uptime monitoring

This is the provisioning source of truth. It is deliberately not highly
available at the application tier; use `mvp-staging-aws-infrastructure` to study
the retained two-target expansion that can be added later.

#### `approved-initial-staging-compact`

Small-screen request-path view derived from the same approved deployment
environment. It intentionally retains only:

- React and Android client instances
- CloudFront endpoint plus static and `/api/*` behaviors
- private S3 frontend origin
- ALB HTTPS listener and target group
- Gunicorn and Django on the single EC2 target
- Timescale Cloud

It omits DNS, certificates, SPA rewrite internals, Origin Access Control,
subnets, NAT, security groups, migrations, Systems Manager, Secrets Manager,
CloudWatch, backups, on-device health internals, uptime monitoring, and Stripe.
Those remain available in `approved-initial-staging`; the compact view is not a
different architecture. Container-level direct client-to-Django relationships
are also excluded so they do not visually bypass the physical CloudFront/ALB
request path.

#### `mvp-staging-ec2-deployment`

Retained proposed two-target staging topology:

- browser and internally distributed Android client placement
- provider-neutral frontend hosting/CDN
- public DNS and ACM-backed HTTPS ALB
- proposed two-AZ placement with two private EC2 application hosts using Docker Engine and Compose
- two long-lived Django API containers in one health-checked ALB target group
- one-off Docker migration container using the same immutable image
- Timescale Cloud reached through encrypted PostgreSQL connections
- provider-managed automated database backups
- Secrets Manager
- CloudWatch
- external `/api/v1/health/live/` monitoring and ALB
  `/api/v1/health/ready/` target probes
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

#### `mvp-staging-aws-infrastructure`

Detailed, cost-gated staging learning view. It makes these boundaries explicit:

- AWS account and `eu-central-1` Region
- one `10.20.0.0/16` VPC
- two public subnets in different Availability Zones for the internet-facing ALB and zonal NAT Gateways
- two private application subnets, each with one EC2/Django target
- Internet Gateway, ALB HTTPS listener, ACM certificate, target group, and security groups
- Route 53 public DNS, Systems Manager, Secrets Manager, and CloudWatch
- external frontend/CDN, Timescale Cloud, Stripe, and uptime monitoring

This is a proposed provisioning layout, not evidence that the resources already
exist. Two targets teach health routing and tolerate one app-host or AZ failure;
the second EC2/EBS allocation and two NAT Gateways require a cost estimate first.

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

### Reading the Public Edge

DNS discovery and request transport are separate. Route 53 answers where a
hostname points; it does not receive or proxy the HTTP request. For the approved
browser path, Route 53 resolves `staging.<domain>` to CloudFront, then the browser
opens TCP/TLS to a nearby CloudFront edge location and sends the request. For
direct API clients, Route 53 resolves `api-staging.<domain>` to the ALB, then the
client opens TCP/TLS to the ALB.

`AWS Global Edge` contains the logical CloudFront distribution endpoint, its
static and `/api/*` behaviors, SPA rewrite, and viewer-certificate boundary.
CloudFront is not the frontend origin: private S3 in `eu-central-1` is the static
origin, and the regional ALB is the API origin. The `us-east-1` ACM resource is
the required control-plane home for the CloudFront viewer certificate, which is
presented through the global edge network.

CloudFront sends default/static paths to private S3 and uncached `/api/*` paths
to the ALB. Android, Stripe, and monitoring call the dedicated API hostname
directly. The ALB terminates its TLS connection and forwards restricted HTTP to
Gunicorn/Django on the private EC2 target. Nginx is deliberately absent because
CloudFront and the ALB already satisfy the approved proxy responsibilities.

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
