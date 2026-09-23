#### Pragmatic MVP Cloud Architecture

## Use When

- Load this when choosing or provisioning the presentation staging topology, or
  when comparing it with the recommended production topology.

## Source of Truth

The Structurizr DSL is the source of truth:
`reference_docs/knowledge/diagrams/longevity-architecture.dsl`.

Current and recommended views:

- `current-presentation-staging`: the approved, cost-bounded staging topology
- `current-presentation-staging-compact`: its request path for small screens
- `recommended-production`: the resilient production recommendation
- `recommended-production-compact`: its request path for small screens

The views named `approved-initial-staging`, `mvp-staging-ec2-deployment`,
`mvp-staging-aws-infrastructure`, and `post-mvp-fargate-deployment` are retained
as **legacy / superseded** records. They must not drive new provisioning.

## Current Presentation Staging

```text
Browser -> staging.<domain> CloudFront
                         |-- static/SPA -> private S3 through OAC
                         `-- uncached /api/*
                                      -> HTTPS origin-staging.<domain>
                                      -> Elastic IP
                                      -> Nginx on one public EC2 host
                                      -> Gunicorn/Django container
                                      -> PostgreSQL 16 container

Android staging build / Stripe webhook / uptime monitor
    -> public HTTPS API hostname
    -> CloudFront API behavior
    -> the same Nginx and Django origin

One-off migration container
    -> same immutable backend image
    -> same validated Secrets Manager snapshot
    -> same PostgreSQL database

Scheduled backup container
    -> pg_dump
    -> private encrypted versioned S3 backup bucket
```

This environment optimizes for a low-traffic presentation deployment, not high
availability. Nginx, Django, and PostgreSQL share one `t4g.small` EC2 host, so
host failure takes down the API and database. That is accepted for staging and
must not be mistaken for the production recommendation.

### Edge, DNS, and TLS Boundary

Route 53 performs DNS discovery; it does not proxy HTTP. CloudFront is the only
public application entry point. It presents an ACM viewer certificate created
in `us-east-1`, serves the React application from private S3, and forwards
uncached `/api/*` traffic to the EC2 origin.

The origin has a separate hostname such as `origin-staging.<domain>`, pointing
to the EC2 Elastic IP. Nginx terminates origin TLS with an automatically renewed
Let's Encrypt certificate obtained through Route 53 DNS-01 validation. The EC2
security group permits inbound TCP 443 only from the AWS-managed CloudFront
origin-facing prefix list. Nginx also rejects requests without the secret
CloudFront origin header. These are complementary controls: the prefix list
restricts network sources and the header proves the expected distribution path.

There is no public SSH, Gunicorn, or PostgreSQL ingress. Operators use Systems
Manager Session Manager. Nginx alone reaches Gunicorn on the host/container
network, and only Django and operational database commands reach PostgreSQL.

### Browser Origin and Static Delivery

CloudFront provides one browser origin at `staging.<domain>`:

```text
Route 53 resolves staging.<domain> to CloudFront
Browser -> CloudFront
              |-- default/static behavior -> private S3
              `-- /api/* behavior          -> Nginx -> Gunicorn -> Django
```

This preserves the frontend's relative `/api/...` URLs and refresh-cookie flow
without credentialed cross-origin browser configuration. SPA fallback applies
only to extensionless static routes; `/api/*` errors and missing hashed assets
must never be rewritten to `index.html`.

Content-hashed assets are immutable and long-cached. `index.html` is short- or
non-cached. A deployment uploads new hashed assets first and `index.html` last,
and does not immediately delete old hashed assets that an older HTML response
may still reference.

### Runtime and Data Boundary

The EC2 instance profile may use Systems Manager, read only
`longevity/staging/backend-runtime`, publish approved CloudWatch data, and write
only to the backup bucket path it owns. The host-side loader retrieves one
`AWSCURRENT` JSON value, validates its canonical key inventory, and passes the
same in-memory snapshot to the migration and API containers without a
persistent production `.env` file.

Deployment runs `python manage.py migrate --no-input` once using the immutable
backend image. Migration failure leaves the old API running. After migration
succeeds, replacing the single API container may cause a brief maintenance
interruption; zero-downtime promotion is not a requirement.

Plain PostgreSQL 16 is self-hosted in a container on the same EC2 host. Its data
lives on encrypted persistent EBS storage, not in the container writable layer.
A scheduled, monitored `pg_dump` writes encrypted logical backups to private
versioned S3, and a restore drill is required before staging can be treated as
recoverable. TimescaleDB is deferred until measured query behavior justifies a
tested migration.

The staging runtime deliberately omits ALB, NAT Gateway, Timescale Cloud, RDS,
Redis, Celery Worker, and Celery Beat. The wearable upload is bounded and
synchronous. Android WorkManager remains responsible for on-device Health
Connect scheduling because server workers cannot read an offline phone.

## Recommended Production

```text
Browser / Android / Stripe
    -> Route 53
    -> CloudFront + AWS WAF
         |-- static/SPA -> private S3
         `-- /api/*    -> public ALB across two AZs
                              -> two private ECS Fargate API tasks
                              -> RDS PostgreSQL Multi-AZ with PITR

One-off Fargate migration task -> RDS
Private task egress -> one NAT Gateway per AZ
Secrets Manager + CloudWatch -> runtime configuration and operations
```

Production separates failure domains and uses managed recovery boundaries:

- two API tasks across Availability Zones behind an ALB
- private compute and database subnets
- RDS PostgreSQL Multi-AZ, automated backups, and point-in-time recovery
- a one-off migration task using the same immutable image
- Terraform-managed infrastructure and separate production identities/secrets
- explicit deployment approval and health verification

Nginx is not required in this production design because CloudFront and ALB own
the edge, TLS, health-routing, and reverse-proxy responsibilities. Redis and
Celery remain deferred until measured asynchronous server work requires them.
RDS PostgreSQL does not provide the TimescaleDB extension; production should
start with ordinary PostgreSQL unless real Timescale-specific queries justify a
different managed database decision.

## Rules

- The current presentation staging topology is approved only for low-volume
  demonstration and learning use.
- Do not copy its colocated database design into a real production environment.
- CloudFront is the only public application entry in current staging.
- EC2 has no public SSH, Gunicorn, or PostgreSQL port.
- Use liveness for public uptime monitoring and readiness for deployment/database
  verification; without an ALB, the deployment script performs the readiness gate.
- Manual staging provisioning must be recorded in a runbook.
- Before real production users, provision the recommended production topology
  reproducibly with Terraform rather than cloning the staging host.
