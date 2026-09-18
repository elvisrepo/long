# Staging Readiness Audit

## Use When

- Load this when preparing the first public AWS staging deployment, deciding what must be fixed before provisioning, or checking whether the backend, frontend, Android build, secrets, and deployment procedure are ready.

## Status

Audit started on 2026-08-20. The public staging frontend and API are deployed
through CloudFront, Nginx, Gunicorn/Django, and PostgreSQL 16 on encrypted EBS.
On 2026-09-17 the operator reported that the Android staging app connects to
the hosted backend, automatic Weight and Steps sync works, and the data appears
correctly in the hosted frontend. The deployed image digest and test conditions
still need to be recorded in the staging playbook. The backend inspection is
complete. Production settings validation and HTTPS/proxy security were
implemented on 2026-08-21, and the
`.env`-free staging secret/runtime contract was implemented on 2026-08-25. The
production-like migration/API deployment smoke was completed locally and in
GitHub CI on 2026-08-26. The frontend delivery contract was completed on
2026-08-27, and the isolated Android staging build contract was completed on
2026-08-31. The AWS fixed-cost analysis, deployable staging Compose contract,
and manual provisioning runbook were completed on 2026-09-03.

The approved deployment topology changed on 2026-08-28. Its intended request
path is
`CloudFront -> Nginx on one public EC2 host -> Gunicorn/Django -> self-hosted
plain PostgreSQL 16`, with encrypted EBS and scheduled `pg_dump` backups to
private S3. This path is deployed; daily backups and an isolated monthly restore
check are monitored. The earlier ALB, NAT Gateway, and Timescale Cloud wording
below is historical audit evidence where explicitly labelled; it is not a
provisioning instruction. Recommended production is the separate resilient
CloudFront/WAF -> ALB -> two Fargate tasks -> RDS PostgreSQL Multi-AZ topology.

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

Nginx was not the fix for this blocker: it is a reverse proxy, not a production
WSGI application server. Gunicorn was still required. Nginx was subsequently
selected in ADR-023 to replace the costly staging ALB's origin TLS and proxy
roles; it does not replace Gunicorn.

The focused runtime contract tests protect the image/Compose split, and CI now
builds the image and uses Gunicorn's configuration check to import the real
production WSGI application. The Structurizr staging views and executable
runtime therefore agree on the application-server boundary. The current
staging request path is `Nginx -> Gunicorn -> Django`.

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

### Blocker C — HTTPS and trusted-proxy settings are incomplete — resolved 2026-08-21

The production settings do not yet define:

- `SECURE_PROXY_SSL_HEADER` for TLS terminated at the trusted reverse proxy
- `SECURE_SSL_REDIRECT`
- `SESSION_COOKIE_SECURE`
- `CSRF_COOKIE_SECURE`
- a deliberate HSTS rollout
- clickjacking/content-type/referrer policy review

Start HSTS conservatively in staging. Do not enable long-duration HSTS or
`includeSubDomains` until every affected hostname is permanently HTTPS-ready.

Implemented outcome:

- trust `X-Forwarded-Proto: https` from the controlled Nginx/ALB deployment boundary
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
- use readiness as the deployment/database gate (and future production ALB target check), while external uptime monitoring uses liveness

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

The approved staging architecture uses CloudFront as the only public
application entry, serves React from private S3 through Origin Access Control,
and proxies uncached `/api/*` requests to Nginx on the EC2 origin. The
`current-presentation-staging` DSL view models this path. Android, Stripe, and
monitoring use the same CloudFront hostname and API behavior.

This blocker is not resolved merely by choosing the provider and changing the
diagram. Configure the `/api/*` behavior without API caching, verify forwarded
host/protocol metadata, and test refresh cookies and CSRF through the deployed
origin. Configure private S3 access, SPA fallback only for static routes, the
CloudFront ACM viewer certificate in `us-east-1`, and the automatically renewed
Let's Encrypt DNS-01 origin certificate on Nginx. A
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

### Blocker H — migration and startup responsibilities — resolved 2026-08-26

Local Compose runs migrations automatically before `runserver`. The cloud
contract correctly requires one explicit migration container to finish before
the API is replaced. The production image must therefore start only the API;
deployment orchestration owns `migrate --no-input` as a separate, observable,
failure-gated step. The image default is Gunicorn-only, while its explicit
`python manage.py migrate --no-input` command remains available.

`scripts.production_deployment` now freezes one inherited Step 7 environment
snapshot, runs the migration container first, blocks API promotion on migration
failure, and then starts/waits for the Gunicorn API through Docker Compose.
`scripts.smoke_production_deployment` exercises the flow with inert local
configuration, verifies liveness and database readiness through the published
loopback port, and attempts cleanup on every post-validation outcome. The real
local run applied every migration, reached healthy API state, passed both host
probes, and left no smoke containers, network, or disposable storage.

The approved availability policy accepts a brief maintenance interruption when
the single API container is replaced. Migration failure leaves the old API
running, but blue/green, rolling, and other zero-downtime promotion mechanisms
are not planned staging or production requirements. Automated deployment does
not imply continuous availability during this replacement window.

### Blocker I — E2E Stripe configuration isolation — resolved 2026-08-24

The `web-e2e` Compose process receives fixed inert Stripe values before
`base.py` loads the bind-mounted local `.env`, and `config.settings.e2e`
unconditionally replaces those Django settings again. Its explicit
`STRIPE_OUTBOUND_API_ENABLED=False` guard prevents Checkout and Customer Portal
services from constructing `StripeClient`; Checkout fails before recording an
attempt. Focused tests protect all three boundaries.

### Blocker J — staging secret/runtime contract — resolved 2026-08-25

The canonical 14-key production environment inventory now lives in dependency-free
`runtime_contract.py` (re-exported by `config.settings.production_environment`)
and is shared by Django production
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

The secret ID is `longevity/staging/backend-runtime`. AWS frontend resources
have been provisioned, while the secret and EC2/backend resources remain future
steps. The human Systems Manager caller remains separate from the future EC2
instance-profile role. The completed Step 8 smoke
consumes this loader contract without creating an AWS resource or persistent
`.env`.

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
   - use readiness for deployment gating and the recommended production ALB target group
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
8. Run a local production-like deployment smoke test — completed 2026-08-26:
   - run the migration container first
   - start Gunicorn with production settings only after migration success
   - verify readiness and representative API smoke tests
   - prove migration failure prevents API promotion
   - run the same executable smoke in backend CI with bounded cleanup and a
     ten-minute timeout
   - run the complete backend suite against PostgreSQL 16 so concurrency tests
     exercise production row-lock semantics; `340` tests and the pushed GitHub
     Actions workflow passed
9. Implement and test the approved frontend delivery contract — completed
   2026-08-27:
   - build Vite assets and upload immutable output to private S3
   - configure CloudFront Origin Access Control
   - configure static caching, SPA fallback, and uncached `/api/*` forwarding
   - test deep links, refresh cookies, CSRF, forwarded metadata, and unmasked API errors
   - upload hashed assets first and `index.html` last without immediately
     deleting superseded assets
   - prove same-origin browser reload restoration, CSRF forwarding, and
     refresh-cookie rotation through the real Vite-to-Django E2E proxy
10. Audit the Android staging build — completed 2026-08-31:
    - add the isolated `com.viridiandome.longevity.staging` application ID
    - inherit non-debuggable release behavior and keep cleartext traffic disabled
    - require an injected `https://staging.<domain>/` origin root; Android
      repositories append their existing `/api/...` endpoint paths
    - reject missing, HTTP, credential-bearing, path-bearing, query-bearing, and
      fragment-bearing staging origins before assembling the APK
    - permit local debug signing only for the first direct-device smoke; require
      a dedicated Play upload-signing boundary for Internal Testing
    - reserve the no-`adb reverse` physical-device API test until the CloudFront
      `/api/*` behavior and EC2 origin are deployed; the frontend hostname exists
11. Cost and write the manual AWS provisioning runbook — completed 2026-09-03:
    include Route 53,
    CloudFront, private S3/OAC, one ACM viewer certificate, EC2/EIP, the
    CloudFront-only origin security group, Nginx, Let's Encrypt DNS-01 renewal,
    ECR, encrypted EBS, plain PostgreSQL 16, monitored `pg_dump` backups to
    private encrypted versioned S3, CloudWatch, Systems Manager, and Secrets
    Manager. Explicitly exclude ALB, NAT Gateway, Timescale Cloud, and RDS from
    presentation staging.
12. Provision staging after the preceding application and runbook gates pass —
    in progress. The public frontend foundation is live; the next resource is
    the private backend ECR repository, followed by the immutable ARM64 image,
    secret/IAM boundary, EC2/EBS host, Nginx origin, and CloudFront API behavior.

Do not provision EC2 or the self-hosted database outside the reviewed runbook.
Otherwise cloud debugging will mix application runtime defects with
infrastructure-learning defects.

## 5. Staging deployment review — 2026-09-10

The pre-deployment review found gaps beyond the earlier mocked orchestration
tests. Repository fixes now cover:

- **EBS prerequisite:** the host loader verifies the prepared data directory is
  on the expected writable ext4 UUID. Compose refuses to create a missing bind
  source. A Docker systemd override requires the mount and runs the same guard
  before daemon startup, including automatic container restoration after reboot.
- **Host bundle:** a seven-file allowlisted archive contains the complete
  standard-library-only host runtime. The key inventory no longer imports the
  application/Celery tree. Python 3.12, AWS CLI, util-linux, and Docker/Compose
  are explicit host prerequisites; no host Django/Celery installation is needed.
- **Migration settings:** both staging and disposable smoke Compose files select
  `config.settings.prod` explicitly for migration and API containers.
- **Destination validation:** the real host loader checks the PostgreSQL engine,
  host, port, user, database, password consistency, and absence of URL overrides.
- **Image identity:** host deployment requires a SHA-256 reference from the one
  staging ECR repository. Choosing an approved release digest remains an operator
  responsibility; syntax/repository validation does not substitute for image review.
- **Logs and probes:** staging logs rotate with bounded retention; readiness
  connects to loopback with an allowed Host and trusted HTTPS metadata.

These are local repository changes, not EC2 installation evidence. The Docker
override still needs installation, loaded-unit inspection, and a reboot check.
It intentionally gates all Docker containers on this dedicated host and assumes
Docker live restore is disabled. See Section 10 of the manual provisioning
playbook for bundle generation, host installation, and the supported entry point.

The workflow does not promise transactional schema rollback, uninterrupted API
availability, automatic database-password rotation, or memory-only Docker secret
storage. Migration failure blocks API replacement but may leave schema changes;
Docker metadata can retain container environments on the encrypted root disk.

## 6. Current gate

Steps 1–11 are complete. Step 12 is active and follows
`reference_docs/playbooks/presentation-staging-manual-provisioning.md` one gate
at a time. The reviewed ARM64 image, runtime secret, EC2/EBS storage guard,
PostgreSQL 16, migrated Django API, Nginx TLS/header guard, and CloudFront
uncached `/api/*` behavior are deployed and verified. Public liveness/readiness
and Stripe test-mode Checkout, Portal, and webhook flows have been verified.
On 2026-09-17 the operator reported working Android automatic Weight and Steps
sync to the hosted backend and correct display in the hosted frontend. On
2026-09-18 the operator verified live Nginx/backend log access and reported no
sensitive values in inspected sign-in and sync logs. Record the deployed image
digest and exact phone/test conditions before closing Step 12. Daily backup and
monthly isolated restore monitoring are active for Step 13. Play Internal
Testing upload key setup remains a later distribution gate. Keep the
PostgreSQL-backed backend suite, production-image smoke, migration/API deployment
smoke, health contract, removed-route, runtime-artifact, E2E Stripe-isolation,
and staging-runtime contract checks green in CI.
