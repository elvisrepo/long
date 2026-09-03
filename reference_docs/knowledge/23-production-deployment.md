## 8. Deployment

## Use When

- Load this for staging and production hosting decisions, DNS/TLS boundaries,
  runtime configuration, frontend delivery, migrations, backups, or promotion.

## Source

- The canonical C4 deployment source is
  `reference_docs/knowledge/diagrams/longevity-architecture.dsl`.

### 8.1 Environment Topologies

Current presentation staging:

| Component | Choice | Boundary |
|---|---|---|
| Frontend and browser edge | CloudFront + private S3/OAC | One public browser origin; cached static files and uncached `/api/*` |
| API origin | Nginx on one public `t4g.small` EC2 host | Origin TLS, secret-origin-header validation, reverse proxy to Gunicorn |
| Application | Gunicorn/Django container | Long-running API; no development server |
| Database | Plain PostgreSQL 16 on the EC2 host | Persistent encrypted EBS volume; not highly available; TimescaleDB is deferred |
| Migrations | One-off container from the backend image | Must succeed before API replacement |
| Secrets | AWS Secrets Manager | One validated `.env`-free runtime snapshot |
| Operations | Systems Manager + CloudWatch | No public SSH; container logs and host alarms |
| Backups | Scheduled `pg_dump` to private encrypted versioned S3 | Monitored logical backup plus restore drill |

The staging host is a single failure domain. Failure of EC2 can affect Nginx,
Django, and PostgreSQL together. This is accepted for a low-traffic presentation
environment and is not the recommended topology for real production users.

Recommended production:

| Component | Choice | Boundary |
|---|---|---|
| Edge | CloudFront + AWS WAF + private S3 | Public frontend and API entry |
| API routing | Public ALB across two AZs | TLS termination and healthy-target routing |
| Application | Two private ECS Fargate API tasks across AZs | Independent replacement and host failure domains |
| Database | RDS PostgreSQL Multi-AZ | Managed failover, backups, and point-in-time recovery |
| Migrations | One-off Fargate task | Same immutable backend image and configuration contract |
| Egress | One NAT Gateway per AZ | Resilient private-task outbound access |
| Configuration/operations | Secrets Manager + CloudWatch | Separate production identities and secrets |

Production does not need Nginx because CloudFront and ALB own its relevant edge
and reverse-proxy responsibilities. Redis, Celery Worker, and Celery Beat are
not baseline requirements; add them only for measured asynchronous workloads.

The previous ALB + one EC2 + Timescale Cloud staging proposal and the earlier
two-EC2/Fargate evolution are preserved as **legacy / superseded** C4 views.
They are historical context, not provisioning instructions.

### 8.2 DNS, TLS, and Origin Security

Route 53 resolves hostnames; it never forwards an HTTP request. In current
staging, clients connect to CloudFront, which is the only public application
entry and presents an ACM viewer certificate created in `us-east-1`.

CloudFront's API behavior connects by HTTPS to an origin hostname such as
`origin-staging.<domain>`, which resolves to the EC2 Elastic IP. Nginx presents
an automatically renewed Let's Encrypt certificate obtained through Route 53
DNS-01 validation. Use a systemd timer for renewal and alert before expiry.

Origin access requires both:

- an EC2 security-group rule allowing TCP 443 only from the AWS-managed
  CloudFront origin-facing prefix list; and
- a secret custom CloudFront origin header that Nginx validates before proxying.

Do not expose ports 22, 8000, or 5432 publicly. Operators use Systems Manager.
Nginx sets the trusted proxy metadata, including `X-Forwarded-Proto: https`, for
Django. HTTP redirects to HTTPS, and Android release builds reject cleartext.

In recommended production, ACM terminates origin/API TLS at the ALB. The ALB
accepts only CloudFront-origin traffic under the equivalent origin restriction,
and its target security group is the only source allowed to reach Fargate.

### 8.3 Runtime Configuration

- `DEBUG=False`, explicit `ALLOWED_HOSTS`, and production `SECURE_*` settings
- Gunicorn for the synchronous WSGI application
- environment-specific CSRF, cookie, Stripe test/live, and logging values
- stdout/stderr logs without secrets, tokens, health values, or Stripe payloads
- no persistent production `.env` file

The staging secret ID is `longevity/staging/backend-runtime`. Canonical keys
live in `backend/config/settings/production_environment.py` and are consumed by
both Django settings and `scripts.staging_runtime`.

```bash
cd backend
uv run --no-sync python -m scripts.staging_runtime \
  --secret-id longevity/staging/backend-runtime \
  --region eu-central-1 \
  -- docker compose ...
```

The loader disables workstation credential sources, retrieves `AWSCURRENT`
once through the EC2 instance role, validates the complete JSON contract, and
passes one allowlisted in-memory snapshot to the deployment command. Retrieval
or validation failure stops before Docker is invoked. A human starts a Systems
Manager session; the machine instance role, not the human profile, reads the
runtime secret.

`scripts.production_deployment` freezes that inherited snapshot, runs the
migration container, and starts/waits for the API only after migration success.
`scripts.smoke_production_deployment` verifies the same contract locally and in
CI. Privileged host or Docker operators can still inspect process environments,
so restrict those privileges and never print unredacted Compose configuration.

### 8.4 Frontend and Request Routing

CloudFront provides one browser origin because React uses relative `/api/...`
URLs. Its behaviors are:

| Request | Owner | Origin/result |
|---|---|---|
| `/metrics/resting_hr` | TanStack Router | Static behavior rewrites to S3 `/index.html`; React renders the route |
| `/assets/{hash}.js` | Vite build output | Exact private-S3 object; immutable and long-cached |
| `/api/v1/metrics/entries/` | Django | Uncached API behavior forwards method, body, auth, cookies, CSRF data, and query string to Nginx |

SPA fallback applies only to extensionless static routes. A missing hashed asset
must remain a static `404`, and `/api/*` failures must remain API responses.

```text
GET /metrics/resting_hr
    -> CloudFront static behavior
    -> private S3 /index.html
    -> TanStack Router renders /metrics/$slug

GET or POST /api/v1/metrics/...
    -> CloudFront uncached API behavior
    -> Nginx
    -> Gunicorn
    -> Django
    -> PostgreSQL
```

Content-hashed JS/CSS is immutable. `index.html` is the non-immutable application
shell and uses `no-cache, no-store, must-revalidate`. A frontend deployment
uploads new hashed assets first and `index.html` last. It must not immediately
delete old hashed assets, because cached older HTML may still reference them.
A metric write changes PostgreSQL and browser query state; it never changes S3
frontend objects or cached application bundles.

Android is an independent API client:

```text
debug API origin   -> http://127.0.0.1:8000/ through adb reverse
staging API origin -> https://staging.<domain>/ over the internet
release API origin -> https://<production-domain>/ over the internet
```

Repositories append endpoint paths such as `/api/auth/mobile/login/` to that
origin root. The staging application ID is
`com.viridiandome.longevity.staging`. A locally debug-signed, non-debuggable APK
is allowed for the first direct-device smoke; repeatable Play Internal Testing
requires a dedicated upload key. The API origin is public build configuration,
not a secret. Native OkHttp is not governed by browser CORS, but all
authentication, throttling, authorization, entitlement, HTTPS, and payload
validation still apply.

### 8.5 Database and Migrations

Current staging runs plain PostgreSQL 16 on encrypted EBS attached to the EC2
host. Database files must live on the mounted persistent volume, never only in
the container layer. PostgreSQL is not publicly reachable. No current migration
enables TimescaleDB or creates a hypertable, so the staging runtime must not
claim otherwise.

```bash
# Command inside the one-off container built from the immutable backend image.
python manage.py migrate --no-input
```

The migration and API containers receive the same frozen configuration snapshot.
If migration fails, deployment stops and the old API remains running. After a
successful migration, replacement of the single API container may create a
brief maintenance interruption. Blue/green and zero-downtime promotion are not
requirements, although automated continuous deployment is still possible.

Keep migrations backward-compatible where practical and retain a documented
manual rollback procedure. In recommended production, the command is unchanged
but runs as a one-off Fargate task against RDS before service promotion.

### 8.6 Health, Security, Monitoring, and Backups

- `GET /api/v1/health/live/` proves the public process/edge path without a
  database dependency and is used by external uptime monitoring.
- `GET /api/v1/health/ready/` proves Django can query PostgreSQL and gates
  deployment completion. Recommended production also uses it for ALB health.
- Apply DRF throttling to authentication, refresh, Stripe session creation, and
  wearable uploads.
- Use CloudFront/WAF where appropriate for edge filtering; network controls do
  not replace Django authorization and throttling.
- CloudWatch collects API, migration, Nginx, backup, host, disk, and certificate
  signals. Alert on disk pressure, failed backup, origin failure, and impending
  certificate expiry.
- Add Sentry before real production exposure, with health and authentication
  data redacted.
- In staging, schedule `pg_dump` to a private encrypted versioned S3 bucket and
  monitor job success. Test a restore before claiming recoverability.
- In recommended production, RDS owns automated backups and point-in-time
  recovery; still document and exercise restoration.

### 8.7 Staging Exit Condition

Staging is proven only when:

- browser deep links load React through CloudFront and API calls traverse Nginx
- a physical staging Android build works without `adb reverse`
- Weight and Steps sync over ordinary Wi-Fi or mobile data, including a newer
  mutable Steps version
- Stripe test Checkout, Portal, and signed webhook reconciliation work publicly
- migration failure blocks promotion and a successful deployment passes both
  health contracts
- logs and alarms are useful without leaking secrets or health data
- a scheduled database backup completes and a documented restore succeeds

### 8.8 Infrastructure and Delivery Progression

1. Cost and document the current presentation staging topology.
2. Provision it manually to learn Route 53, CloudFront/OAC, S3, EC2/EIP, Nginx,
   Let's Encrypt DNS-01, EBS, IAM, Systems Manager, Secrets Manager, CloudWatch,
   ECR, and backup/restore operations.
3. Add staging CD through GitHub OIDC: publish immutable images/assets, invoke
   the host through Systems Manager, run migration, replace the API during the
   accepted maintenance window, and verify public smoke checks.
4. Before accepting real production users, implement the recommended ALB + two
   Fargate tasks + RDS Multi-AZ topology in Terraform with isolated identities,
   secrets, data, and Stripe mode.
5. Require explicit approval for production promotion. Add Redis/Celery only
   when a measured server-side workload needs durable asynchronous execution.

Terraform changes infrastructure; the deployment pipeline moves a tested
application version onto it. Neither replaces the other.
