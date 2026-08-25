# Staging Readiness Audit

## Use When

- Load this when preparing the first public AWS staging deployment, deciding what must be fixed before provisioning, or checking whether the backend, frontend, Android build, secrets, and deployment procedure are ready.

## Status

Audit started on 2026-08-20. AWS account access is bootstrapped, but no
Longevity application resources have been provisioned. The backend inspection
is complete. Production settings validation and HTTPS/proxy security were
implemented on 2026-08-21, and the `.env`-free staging secret/runtime contract
was implemented on 2026-08-25. The production-like deployment smoke, frontend
hosting/origin, Android staging build, and detailed AWS cost/resource audits
remain open.

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

### Blocker A — no production application server — resolved 2026-08-24

Gunicorn is locked as a runtime dependency, and the Docker image now defaults
to serving `config.wsgi:application` with `config.settings.prod`. The command
defines two workers, 30-second request and graceful-shutdown timeouts, and
stdout/stderr access and error logs. Local and E2E Compose services deliberately
override that default with Django's development server.

Implemented outcome:

- add and lock Gunicorn
- run Gunicorn against `config.wsgi:application`
- explicitly select `config.settings.prod`
- keep local Compose free to override the image command with `runserver`
- define worker count, timeout, graceful shutdown, and forwarded-access-log behavior deliberately

Nginx is not the fix for this blocker: it is a reverse proxy, not a production
WSGI application server. The approved topology already has CloudFront and the
ALB as managed proxies. Add and verify Gunicorn; do not add Nginx without a
separate, concrete proxy requirement.

The focused runtime contract tests protect the image/Compose split, and CI now
builds the image and uses Gunicorn's configuration check to import the real
production WSGI application. The Structurizr staging views and executable
runtime therefore agree on `ALB → Gunicorn → Django`.

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

### Blocker D — health contract and readiness semantics disagree — resolved 2026-08-24

The legacy `GET /health/` route has been removed. The implemented versioned
contracts are now:

- `GET /api/v1/health/live/` returns fixed process status without querying the
  database;
- `GET /api/v1/health/ready/` executes `SELECT 1` through Django's default
  connection and returns a redacted `503` when the database is unavailable.

Implemented outcome:

- use the two canonical versioned public routes documented above
- keep liveness independent of the database and optional services
- make readiness prove Django can query PostgreSQL
- do not make readiness depend on Redis/Celery while staging omits them
- point the ALB at the readiness contract and the external uptime monitor at the public liveness contract

Changing the route is a public API-contract slice and must update the API,
deployment, security, testing, and Structurizr references together.

### Blocker E — public Celery ping endpoint — resolved 2026-08-24

`GET /tasks/ping/` now returns `404`; its URL, view, and unused
`common.tasks.ping` implementation have been removed. Celery configuration can
still be tested without exposing an HTTP action that writes to the broker.

Implemented outcome: future task verification must use a local/test-only
diagnostic or protected operational command when Celery becomes real
application infrastructure.

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

### Blocker G — image-context and runtime-artifact cleanup — resolved 2026-08-24

`backend/celerybeat-schedule` is no longer tracked but remains available as
ignored local scheduler state. Git and the backend Docker context now exclude
all `celerybeat-schedule*` variants, preventing `COPY . .` from placing them in
the image.

The multi-stage Dockerfile now keeps `uv`, pytest, mypy, Ruff, full source, and
bind-mount behavior in the development/build boundary. The final Python-slim
stage copies only runtime dependencies and application source, excludes
`tests/`, and runs Gunicorn as the unprivileged `django` user.

### Blocker H — migration and startup responsibilities — image boundary resolved 2026-08-24

Local Compose runs migrations automatically before `runserver`. The cloud
contract correctly requires one explicit migration container to finish before
the API is replaced. The production image must therefore start only the API;
deployment orchestration owns `migrate --no-input` as a separate, observable,
failure-gated step. The image default is Gunicorn-only, while its explicit
`python manage.py migrate --no-input` command remains available. Step 8 still
must prove migration failure blocks promotion in a production-like flow.

### Blocker I — E2E Stripe configuration isolation — resolved 2026-08-24

The `web-e2e` Compose process receives fixed inert Stripe values before
`base.py` loads the bind-mounted local `.env`, and `config.settings.e2e`
unconditionally replaces those Django settings again. Its explicit
`STRIPE_OUTBOUND_API_ENABLED=False` guard prevents Checkout and Customer Portal
services from constructing `StripeClient`; Checkout fails before recording an
attempt. Focused tests protect all three boundaries.

### Blocker J — staging secret/runtime contract — resolved 2026-08-25

The canonical 14-key production environment inventory now lives in
`config.settings.production_environment` and is shared by Django production
validation and the host-side staging loader, preventing the two contracts from
drifting.

`scripts.staging_runtime` retrieves one `AWSCURRENT` SecretString through the
EC2 instance role, with workstation/static/web-identity/container credential
sources disabled. It validates JSON shape, required-key presence, nonblank
string values, and the allowlist before running one child deployment command.
It injects the validated snapshot through process environment without creating
a persistent `.env` or putting values in command arguments. Expected retrieval,
configuration, and child-process failures are redacted and return controlled
nonzero statuses.

The planned secret ID is `longevity/staging/backend-runtime`; no AWS resource
has been created by this slice. The human Systems Manager caller remains
separate from the future EC2 instance-profile role. Step 8 must still implement
and prove the real Compose migration/API promotion sequence.

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

Use focused TDD slices in this order. The S3/CloudFront same-origin decision and
one-initial-EC2 topology are approved; the remaining work is implementation and
verification.

1. Production settings validation and HTTPS/proxy security — completed
   2026-08-21.
2. Implement the Gunicorn production runtime — completed 2026-08-24:
   - add and lock Gunicorn with `uv`
   - run `config.wsgi:application` with `config.settings.prod`
   - define workers, timeout, graceful shutdown, and access logging
   - keep local Compose overriding the image command with `runserver`
   - add a production-image smoke test
3. Implement versioned health contracts and repair stale references — completed
   2026-08-24:
   - `GET /api/v1/health/live/` is process liveness and does not query the database
   - `GET /api/v1/health/ready/` proves Django can query PostgreSQL
   - point the ALB target group at readiness
   - point external uptime monitoring at liveness
   - update API, security, testing, deployment, and Structurizr documentation in the same route-contract slice
4. Remove unused public Celery behavior and runtime artifacts — completed
   2026-08-24:
   - remove `/tasks/ping/` from public URLs
   - stop tracking `backend/celerybeat-schedule`
   - ignore all Celery Beat schedule variants in Git and Docker build contexts
5. Harden the production image — completed 2026-08-24:
   - separate production runtime dependencies from development/test tools
   - exclude local runtime artifacts and source bind mounts from the production image
   - make API startup run only the application server
   - keep migrations as a separate observable, failure-gated container command
6. Isolate E2E configuration — completed 2026-08-24:
   - provide deliberately non-functional Stripe values
   - prove E2E processes cannot create Stripe sandbox objects accidentally
7. Define the staging Secrets Manager inventory and `.env`-free runtime
   contract — completed 2026-08-25:
   - share one canonical 14-key inventory between Django and deployment tooling
   - retrieve one `AWSCURRENT` value through EC2 instance-role credentials only
   - reject malformed, incomplete, blank, or wrongly typed configuration
   - omit unexpected keys and keep values out of command-line arguments
   - provide redacted, controlled CLI failures without a persistent `.env`
8. Run a local production-like deployment smoke test:
   - run the migration container first
   - start Gunicorn with production settings only after migration success
   - verify readiness and representative API smoke tests
   - prove migration failure prevents API promotion
9. Implement and test the approved frontend delivery contract:
   - build Vite assets and upload immutable output to private S3
   - configure CloudFront Origin Access Control
   - configure static caching, SPA fallback, and uncached `/api/*` forwarding
   - test deep links, refresh cookies, CSRF, forwarded metadata, and unmasked API errors
10. Audit the Android staging build:
    - staging application ID and signing
    - `https://api-staging.<domain>/` base URL
    - no `adb reverse`
    - internal distribution method
11. Cost and write the manual AWS provisioning runbook, including Route 53,
    CloudFront, private S3, both ACM certificates, ALB, one EC2 target, one NAT
    Gateway, EBS, CloudWatch, Secrets Manager, and Timescale Cloud.
12. Provision staging only after the preceding application and runbook gates pass.

Do not provision the ALB, EC2 host, DNS, S3/CloudFront distribution, or managed
database before steps 1–8 pass. Otherwise cloud debugging will mix application
runtime defects with infrastructure-learning defects.

## 5. Current gate

The next implementation slice is the local production-like deployment smoke in
step 8; do not provision AWS first. It must use the Step 7 loader to provide one
snapshot to the migration and API containers, start or replace the API only
after migration success, verify readiness and representative API behavior, and
prove migration failure blocks promotion. Keep the production-image,
health-contract, removed-route, runtime-artifact, E2E Stripe-isolation, and
staging-runtime contract checks in CI.
