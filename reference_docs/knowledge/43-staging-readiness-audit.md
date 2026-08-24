# Staging Readiness Audit

## Use When

- Load this when preparing the first public AWS staging deployment, deciding what must be fixed before provisioning, or checking whether the backend, frontend, Android build, secrets, and deployment procedure are ready.

## Status

Audit started on 2026-08-20. AWS account access is bootstrapped, but no
Longevity application resources have been provisioned. The backend inspection
is complete. Production settings validation and HTTPS/proxy security were
implemented on 2026-08-21; frontend hosting/origin, Android staging-build, and
detailed AWS cost/resource audits remain open.

## 1. Verified foundations

- `config.settings.prod` exists and forces `DEBUG = False`.
- `ALLOWED_HOSTS` and `CSRF_TRUSTED_ORIGINS` already come from environment variables.
- database configuration uses `DATABASE_URL` and persistent connections.
- application logs go to stdout/stderr through Django console logging.
- destructive browser-test routes are mounted only when `ENABLE_E2E_TESTING_API` is explicitly enabled.
- `.env`, the virtual environment, caches, and local SQLite files are excluded from the Docker build context.
- the current health view is public and side-effect free.
- browser refresh tokens use an HttpOnly, Secure cookie; Android uses its separate Bearer-token contract.
- the Docker build installs the committed `uv.lock` dependency graph with `uv sync --frozen`.

These are useful foundations, not proof that the current image is safe to put on
the internet.

## 2. Backend blockers before public staging

### Blocker A — no production application server

The Docker image and local Compose service start `python manage.py runserver`.
Django's development server is not the staging runtime. Gunicorn is documented
as the intended synchronous WSGI server but is not yet a dependency or image
command.

Required outcome:

- add and lock Gunicorn
- run Gunicorn against `config.wsgi:application`
- explicitly select `config.settings.prod`
- keep local Compose free to override the image command with `runserver`
- define worker count, timeout, graceful shutdown, and forwarded-access-log behavior deliberately

Nginx is not the fix for this blocker: it is a reverse proxy, not a production
WSGI application server. The approved topology already has CloudFront and the
ALB as managed proxies. Add and verify Gunicorn; do not add Nginx without a
separate, concrete proxy requirement.

The Structurizr staging views now show the intended `ALB → Gunicorn → Django`
runtime, but that model change does not resolve this blocker. The dependency,
image command, configuration, and focused process/health tests remain required.

### Blocker B — production settings are not fail-safe — resolved 2026-08-21

`prod.py` currently changes only `DEBUG`. Base settings still provide an
insecure development `SECRET_KEY`, SQLite fallback, local Redis fallback, and
localhost Stripe return URLs. A missing production secret could therefore
start the service with an unsafe or incorrect fallback instead of failing.

Required production inputs:

- `SECRET_KEY`
- `PII_ENCRYPTION_KEY`
- `EMAIL_LOOKUP_KEY`
- `JWT_SIGNING_KEY`
- `DATABASE_URL`
- `ALLOWED_HOSTS`
- `CSRF_TRUSTED_ORIGINS`
- Stripe sandbox secret, webhook secret, Checkout URLs, and Portal return URL
- explicit log levels

Staging intentionally omits Celery and Redis, so the production API must not
require `REDIS_URL` until an asynchronous server workload is introduced.

Implemented outcome:

- production startup rejects every missing or blank required input above
- `DATABASE_URL` must resolve to Django's PostgreSQL backend
- Stripe browser return URLs must use non-local HTTPS origins
- a complete valid production environment still loads successfully

### Blocker C — HTTPS and ALB proxy settings are incomplete — resolved 2026-08-21

The production settings do not yet define:

- `SECURE_PROXY_SSL_HEADER` for TLS terminated at the ALB
- `SECURE_SSL_REDIRECT`
- `SESSION_COOKIE_SECURE`
- `CSRF_COOKIE_SECURE`
- a deliberate HSTS rollout
- clickjacking/content-type/referrer policy review

Start HSTS conservatively in staging. Do not enable long-duration HSTS or
`includeSubDomains` until every affected hostname is permanently HTTPS-ready.

Implemented outcome:

- trust `X-Forwarded-Proto: https` from the ALB deployment boundary
- redirect genuinely insecure requests to HTTPS
- mark session and CSRF cookies Secure
- start HSTS at 300 seconds with subdomains and preload disabled
- retain Django's secure defaults for frame denial, MIME-sniffing prevention,
  and same-origin referrer policy

### Blocker D — health contract and readiness semantics disagree

The implemented route is `GET /health/`, while the canonical deployment docs
say that the ALB checks `GET /api/v1/health/`. The current handler always returns
`{"status": "ok"}` and does not prove database readiness.

Required outcome:

- choose and document one canonical public route, preferably `/api/v1/health/`
- keep a cheap liveness response independent of optional services
- add a readiness check that proves Django can query PostgreSQL
- do not make readiness depend on Redis/Celery while staging omits them
- point the ALB at the readiness contract and the external uptime monitor at the public liveness contract

Changing the route is a public API-contract slice and must update the API,
deployment, security, testing, and Structurizr references together.

### Blocker E — public Celery ping endpoint

`GET /tasks/ping/` is mounted publicly and calls `ping.delay()`. In the planned
staging topology this either fails because Redis/Celery are absent or exposes an
unauthenticated queue-producing endpoint if they are present.

Required outcome: remove it from public production URLs. Keep task verification
as a local/test-only diagnostic or a protected operational command when Celery
eventually becomes real application infrastructure.

### Blocker F — S3/CloudFront same-origin strategy approved; implementation remains

The React client calls relative `/api/...` routes and its refresh-cookie flow is
simplest and safest behind one browser origin. S3 plus CloudFront is now the
approved frontend, and Django intentionally has no credentialed cross-origin
browser configuration for this same-origin design.

The approved staging architecture uses CloudFront as one public browser origin,
serves React from a private S3 bucket through Origin Access Control, and proxies
uncached `/api/*` requests to the ALB. The `approved-initial-staging` DSL view
models this path. `api-staging.<domain>` remains available for Android, Stripe,
monitoring, and the CloudFront API origin.

This blocker is not resolved merely by choosing the provider and changing the
diagram. Configure the `/api/*` behavior without API caching, verify forwarded
host/protocol metadata, and test refresh cookies and CSRF through the deployed
origin. Configure private S3 access, SPA fallback only for static routes, and
the separate CloudFront (`us-east-1`) and ALB (`eu-central-1`) certificates. A
future separate-origin design would instead require credentialed CORS,
cookie-domain/SameSite review, and cross-origin tests.

Android is unaffected by browser CORS because OkHttp is a native client, but it
still requires the public HTTPS API base URL.

### Blocker G — image-context and runtime-artifact cleanup

`backend/celerybeat-schedule` is a tracked local scheduler database and is not
excluded by `.dockerignore`, so `COPY . .` can place it in the backend image.
Remove it from version control and ignore all Celery Beat schedule variants.
The production image should contain source and immutable dependencies, not local
runtime state.

The Dockerfile also runs `uv sync --frozen` without excluding the default
development group. Consequently, the image includes pytest, mypy, and Ruff.
Create distinct production and development/test image targets, or otherwise
install only runtime dependencies in the production target.

### Blocker H — migration and startup responsibilities

Local Compose runs migrations automatically before `runserver`. The cloud
contract correctly requires one explicit migration container to finish before
the API is replaced. The production image must therefore start only the API;
deployment orchestration owns `migrate --no-input` as a separate, observable,
failure-gated step.

### Blocker I — E2E Stripe configuration is not fully isolated

`config.settings.e2e` imports `base.py`, which loads the bind-mounted local
`.env`. E2E settings replace application secrets and the database, but they do
not replace Stripe settings. The current browser E2E suite exercises auth and
does not call Stripe; nevertheless, its process should receive non-functional
Stripe values so a future E2E test cannot accidentally create sandbox objects.

## 3. Django deployment-check evidence

The audit ran:

```bash
uv run python manage.py check --deploy --settings=config.settings.prod
```

with non-secret audit-only environment values. Django reported:

- missing HSTS configuration
- missing HTTPS redirect configuration
- insecure session-cookie setting
- insecure CSRF-cookie setting
- a deliberately weak audit-only `SECRET_KEY`
- `User.email` is not database-unique even though it is `USERNAME_FIELD`

The email warning reflects the encrypted-email design: uniqueness is enforced
by unique `email_lookup_hash`, and `EmailLookupHashBackend` authenticates through
that field. It should be documented or deliberately silenced with a project
system-check decision; making randomized encrypted ciphertext unique would not
enforce normalized email uniqueness.

The weak-key warning came from the disposable audit value, but it exposed the
real requirement that production must reject a missing/weak key rather than use
the base development fallback.

After the 2026-08-21 remediation, `check --deploy` reports only the deliberate
staging HSTS subdomain/preload warnings and the documented encrypted-email
`auth.W004` warning. The missing HTTPS redirect and insecure-cookie warnings are
resolved.

## 4. Remediation order

Use focused TDD slices in this order:

1. production settings validation and HTTPS/proxy security — completed 2026-08-21
2. Gunicorn production command and production-image smoke check
3. versioned liveness/readiness endpoints and stale-route documentation repair
4. remove the public Celery ping route and tracked scheduler artifact
5. isolate E2E Stripe settings and split production versus development image dependencies
6. decide and test the browser origin strategy
7. define the staging Secrets Manager inventory and `.env`-free runtime contract
8. run a local production-like container smoke test, including migration failure behavior
9. audit frontend hosting/build configuration
10. audit Android staging application ID, signing, and API base URL
11. write the costed manual AWS provisioning runbook

Do not provision the ALB, EC2 host, DNS, or managed database before at least
steps 1–8 pass. Otherwise cloud debugging will mix application-runtime defects
with infrastructure-learning defects.

## 5. Current gate

The next implementation slice is the Gunicorn production command and
production-image smoke check. Keep local Compose free to override the image
command with `runserver`.
