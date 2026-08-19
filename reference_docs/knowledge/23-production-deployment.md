## 8. Production Deployment

## Use When
- Load this when you need production hosting decisions, domain and SSL setup, runtime environment rules, CDN strategy, migration procedure, or rate limiting and DDoS protection.

## Source
- Derived from `reference_docs/knowledge/planning.md` section 8.

### 8.1 Hosting

Initial public staging:

| Component | Service | Why |
|---|---|---|
| **Frontend** | Vercel or S3 + CloudFront | HTTPS static asset origin and CDN; choose one during provisioning |
| **Backend** | AWS ECS Fargate + ALB | Managed Django container with a direct path to later worker tasks |
| **Database** | Timescale Cloud (PostgreSQL + TimescaleDB) | Managed database matching the intended time-series direction |
| **Secrets** | AWS Secrets Manager | Server-side Django, database, and Stripe configuration |
| **Logs/Metrics** | CloudWatch | Container stdout/stderr and AWS infrastructure metrics |
| **Database Backups** | Timescale Cloud automated backups | Provider-owned backup and restoration boundary |

The initial staging runtime does not require ElastiCache, Celery Worker, or
Celery Beat. Add those only when a measured server-side workload needs durable
asynchronous execution. Android WorkManager remains responsible for device-side
Health Connect scheduling even after Celery exists.

Evolved worker-enabled MVP:

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

### 8.3 Production Environment
- `DEBUG=False`, `ALLOWED_HOSTS` set, `SECURE_*` Django settings
- Secrets from AWS Secrets Manager (not env vars baked in image)
- Gunicorn for the current synchronous Django runtime; add ASGI/Uvicorn only when a real Channels or async transport requirement exists
- explicit frontend origin, CORS, CSRF trusted origins, and secure cookie configuration
- console/structured logging without secrets, JWTs, health values, or Stripe payload leakage
- environment-specific Stripe test versus live credentials and webhook secrets

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

### 8.4 CDN
- host immutable React assets through Vercel or S3 + CloudFront
- configure long-lived cache headers for content-hashed assets and short/no-cache behavior for the HTML entry point
- Django static/admin assets may use S3 + CloudFront if the production image does not serve them directly
- do not describe the Django API as the owner of managed database backups

### 8.5 Database Migrations in Production
```bash
# Run the immutable Django image as a one-off ECS task before service promotion.
uv run python manage.py migrate --no-input
```

The migration task reads the same database and Django settings from Secrets
Manager, sends logs and exit status to CloudWatch, and must complete successfully
before the API service is promoted. Do not run competing migrations from every
API container startup.

### 8.6 Rate Limiting & DDoS
- AWS WAF on ALB (basic DDoS protection)
- Django/DRF throttling for auth, token refresh, Stripe session creation, and wearable uploads
- CloudFront for static asset protection

### 8.7 Health, Monitoring, and Backups

- ALB checks `GET /api/v1/health/` on the Django service.
- An external uptime monitor checks the same public HTTPS endpoint.
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
