## 8. Production Deployment

## Use When
- Load this when you need production hosting decisions, domain and SSL setup, runtime environment rules, CDN strategy, migration procedure, or rate limiting and DDoS protection.

## Source
- Derived from `reference_docs/knowledge/planning.md` section 8.

### 8.1 Hosting

Initial public staging:

| Component | Service | Why |
|---|---|---|
| **Frontend** | Private S3 bucket + CloudFront | Approved same-origin static SPA and `/api/*` proxy; learn the AWS CDN and origin-security boundary |
| **Backend** | ACM-backed ALB + one private EC2 Docker Compose host initially | Start cheaply with one target and add a second-AZ target later without changing DNS or API contracts |
| **Database** | Timescale Cloud (PostgreSQL + TimescaleDB) | Managed database matching the intended time-series direction |
| **Secrets** | AWS Secrets Manager | Server-side Django, database, and Stripe configuration |
| **Logs/Metrics** | CloudWatch | Container stdout/stderr and AWS infrastructure metrics |
| **Database Backups** | Timescale Cloud automated backups | Provider-owned backup and restoration boundary |

The EC2 application port accepts traffic only from the ALB security group, and
administration should use AWS Systems Manager instead of exposing SSH publicly.
The ALB spans public subnets in two Availability Zones; the approved first EC2
target occupies a private application subnet and has no inbound port 22. This
one-target staging environment remains a single point of failure until the
second-AZ target is added.
The initial staging runtime does not require ElastiCache, Celery Worker, or
Celery Beat. Add those only when a measured server-side workload needs durable
asynchronous execution. Android WorkManager remains responsible for device-side
Health Connect scheduling even after Celery exists.

Post-MVP Fargate target:

| Component | Service | Trigger |
|---|---|---|
| **Broker** | AWS ElastiCache Redis | Async jobs are introduced |
| **Workers** | ECS Fargate Celery Worker | Backfills, analytics, repair, exports, deletion, or slow ingestion |
| **Scheduler** | ECS Fargate Celery Beat | Tested periodic server-side work exists |
| **Artifacts** | Versioned S3 | Logical backups, exports, repair outputs, or media exist |

### 8.2 Domain & SSL
- API domain via Route53 or Cloudflare
- separate staging and production API hostnames, for example `api-staging.<domain>` and `api.<domain>`
- TLS certificate provisioned through ACM and terminated at the ALB
- HTTP redirects to HTTPS; the Android release manifest continues to reject cleartext traffic
- Stripe test/live webhook destinations use the corresponding public HTTPS endpoint

Route53 publishes the hostname-to-ALB alias; it does not perform TLS. The ALB's
port-443 listener presents the ACM certificate, negotiates and terminates the
client TLS connection, then forwards the decrypted request to the EC2 target.
The EC2 application security group must accept traffic only from the ALB
security group because Django trusts the ALB's `X-Forwarded-Proto: https`
header. Under the MVP boundary, the ALB-to-EC2 hop is HTTP inside that restricted
network path; moving to HTTPS targets would be a separate hardening decision.

### 8.3 Production Environment
- `DEBUG=False`, `ALLOWED_HOSTS` set, `SECURE_*` Django settings
- Secrets from AWS Secrets Manager (not env vars baked in image)
- Gunicorn for the current synchronous Django runtime; add ASGI/Uvicorn only when a real Channels or async transport requirement exists
- explicit frontend origin, CORS, CSRF trusted origins, and secure cookie configuration
- console/structured logging without secrets, JWTs, health values, or Stripe payload leakage
- environment-specific Stripe test versus live credentials and webhook secrets

`DEBUG=False` is independent of logging. It suppresses developer exception
pages and debug-only behavior for public requests; redacted diagnostics still
flow through the configured log levels to CloudWatch.

The selected staging browser architecture uses one browser origin because React
currently uses relative `/api/...` URLs. CloudFront serves private-S3 assets and
proxies uncached `/api/*` to the ALB. A separate API origin is valid only
with explicit credentialed CORS, cookie-domain/SameSite review, CSRF trusted
origins, and cross-origin tests. Android, Stripe webhooks, and monitoring still
use the dedicated public API hostname directly.

Android environment boundary:

```text
debug   → http://127.0.0.1:8000/ through adb reverse
staging → https://api-staging.<domain>/ over the internet
release → https://api.<domain>/ over the internet
```

The staging/release client uses the same mobile JWT, subscription-policy,
wearable-connection, and normalized upload endpoints. Only the base URL changes;
no USB tunnel is involved. Use release signing and Play Internal Testing or an
equivalent private channel for physical staging validation. The API base URL is
public configuration and must not contain secrets.

#### Android-to-Cloud Request Path

Android and React are independent clients of Django. Android never connects
through the React frontend and never receives database, AWS, Django, or Stripe
server credentials.

```text
Samsung Health
    → Health Connect on the phone
    → installed Longevity Android build
    → public API hostname over HTTPS
    → Route53/public DNS
    → ALB port 443 and ACM certificate
    → Django container on EC2
    → Timescale Cloud

React browser
    → the same Django API
    → reads the resulting MetricEntry state
```

The EC2 application port is not public; its security group accepts application
traffic only from the ALB security group. Android trusts the ordinary public
TLS certificate and uses OkHttp to call mobile login, refresh/logout,
current-subscription policy, wearable lifecycle, and normalized upload
endpoints. Browser CORS policy does not govern native OkHttp requests, although
JWT validation, throttling, ownership checks, plan entitlements, HTTPS, and
payload validation still apply.

Planned Android build configuration:

```text
debug    application ID: com.viridiandome.longevity.debug
         API: http://127.0.0.1:8000/ through adb reverse

staging  application ID: com.viridiandome.longevity.staging
         API: https://api-staging.<domain>/
         distribution: signed APK for first smoke test, then Play Internal Testing

release  application ID: com.viridiandome.longevity
         API: https://api.<domain>/
         distribution: production Play release
```

Using a separate staging application ID lets staging and production coexist on
one phone. Android treats their Keystore entries, encrypted sessions, app data,
and Health Connect permission grants separately. The API URL is compiled/public
configuration; changing it requires a new build unless a future trusted remote
configuration mechanism is deliberately introduced.

### 8.4 CDN
- host immutable React assets in a private S3 bucket and expose them only through CloudFront Origin Access Control
- configure long-lived cache headers for content-hashed assets and short/no-cache behavior for the HTML entry point
- configure `/api/*` as a separate uncached ALB origin behavior that forwards required methods, cookies, authorization, CSRF headers, query strings, and bodies
- scope SPA route rewriting to the static behavior so `/api/*` errors remain API responses
- Django static/admin assets may use S3 + CloudFront if the production image does not serve them directly
- do not describe the Django API as the owner of managed database backups

Route 53 only resolves `staging.<domain>` to CloudFront; it does not receive or
forward the browser's HTTP request. After DNS resolution, the browser connects
to a nearby CloudFront edge location. The distribution then selects private S3
for the default/static behavior or the ALB for `/api/*`.

Nginx is not part of the approved initial topology. CloudFront already owns
global static delivery and path-based origin selection, while the ALB owns API
TLS termination, health checks, and target routing. Gunicorn runs Django on the
private EC2 host. Add Nginx only for a concrete requirement such as local file
serving, specialized buffering, Unix-socket proxying, or behavior unavailable
from CloudFront and the ALB.

#### Mapping the Traditional Web-Server Pipeline

The common `web server → WSGI server → Python application` diagram assumes a
single Nginx- or Apache-like reverse proxy. The approved staging topology splits
that traditional web-server role between two managed AWS services:

- CloudFront is the public edge/CDN and first reverse proxy for browser traffic
  at `staging.<domain>`. It terminates the browser TLS connection, serves cached
  static content, and selects an origin from the request path.
- The ALB is the API-facing reverse proxy and load balancer. It terminates the
  origin/API TLS connection, checks target health, selects a healthy EC2 target,
  and forwards the request to Gunicorn over the restricted application path.
- Gunicorn is the WSGI application server. Its workers invoke Django; it is not
  a replacement for Django's routing, authentication, business logic, or data
  access.

Browser API request:

```text
Browser → CloudFront `/api/*` behavior → ALB → Gunicorn → Django
```

Browser React/static request:

```text
Browser → CloudFront default/static behavior → private S3 bucket
```

The static path never reaches the ALB, Gunicorn, or Django. Native Android,
Stripe webhooks, and API uptime monitoring use the dedicated API hostname and
therefore enter at the ALB rather than through the browser's CloudFront
distribution. Route 53 precedes these connections only as DNS resolution; it
does not proxy or process the HTTP request.

### 8.5 Database Migrations in Production
```bash
# On EC2, run the immutable backend image once before replacing the API container.
python manage.py migrate --no-input
```

The migration task reads the same database and Django settings from Secrets
Manager, sends logs and exit status to CloudWatch, and must complete successfully
before the API service is promoted. Do not run competing migrations from every
API container startup. Deployment tooling supplies the image, environment, and
one-off container mechanism; the command shown is the command inside that
container. The final image intentionally excludes `uv`.

After migration to Fargate, use the same immutable image and command as a
one-off ECS task. The responsibility is unchanged; only the compute mechanism
moves from a temporary Docker container on EC2 to a temporary Fargate task.

### 8.6 Rate Limiting & DDoS
- AWS WAF on ALB (basic DDoS protection)
- Django/DRF throttling for auth, token refresh, Stripe session creation, and wearable uploads
- CloudFront for static asset protection

### 8.7 Health, Monitoring, and Backups

- ALB checks `GET /api/v1/health/ready/`; a target is routable only while
  Django can execute the PostgreSQL probe.
- An external uptime monitor checks `GET /api/v1/health/live/` over public
  HTTPS. This distinguishes process/edge availability from database readiness.
- Neither check depends on Redis or Celery in the approved initial staging
  runtime.
- CloudWatch collects API and migration logs plus AWS metrics.
- Add Sentry before production exposure for unhandled Django exceptions; redact health and authentication data.
- Timescale Cloud owns automated database backups. Record the real retention when provisioning.
- Perform and document a restore drill before promoting staging to production.
- Add optional logical `pg_dump` exports to versioned S3 only after a tested scheduler exists.

### 8.8 Staging Exit Condition

The staging deployment is proven only when:

- the browser loads React from the public frontend host and calls Django over HTTPS
- the physical Android staging build logs in through the public API without `adb reverse`
- Samsung-originated Weight and Steps synchronize over ordinary Wi-Fi or mobile data
- a mutable Steps record updates through its newer Health Connect modification timestamp
- Stripe test Checkout, Portal, and signed webhook reconciliation work through the public endpoint
- migrations, health checks, logs, automated backups, and at least one restore procedure are verified

### 8.9 Infrastructure and Delivery Progression

1. Provision staging manually to learn Route53, ACM, ALB, target groups, EC2,
   security groups, IAM, Systems Manager, Secrets Manager, and CloudWatch.
2. Record every command and configuration decision in a deployment runbook.
3. Recreate the same EC2 topology with Terraform before accepting production
   users; staging and production remain isolated environments.
4. Add a staging deployment pipeline that builds an immutable image, pushes it
   to ECR, invokes EC2 through Systems Manager, runs the migration container,
   replaces Django, and verifies public health/smoke checks.
5. Require explicit approval before a later production deployment pipeline
   promotes a tested version.
6. Post-MVP, migrate compute to ECS Fargate and add Redis, Celery Worker, one
   Beat scheduler, and S3 artifacts only when real asynchronous workloads exist.

Terraform provisions and changes infrastructure. The deployment pipeline moves
a tested application version onto that infrastructure. Neither replaces the
other.
