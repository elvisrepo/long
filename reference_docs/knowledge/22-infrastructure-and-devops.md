## 7. Infrastructure & DevOps

## Use When
- Load this when you need infrastructure planning, CI/CD design, container strategy, secrets handling at the infrastructure level, or production backup policy.

## Source
- Derived from `reference_docs/knowledge/planning.md` section 7.

### 7.1 IaC (Terraform)

> [!NOTE]
> Build the cost-bounded presentation staging environment manually once and
> document every step. Before accepting real production users, provision the
> separate resilient production topology with Terraform; do not clone the
> single-host staging failure domain into production.

#### Current AWS foundation

The initial AWS account and workstation access foundation was completed on
2026-08-20. No Longevity application infrastructure has been provisioned yet.

| Concern | Current decision |
|---|---|
| AWS account | Free plan with promotional credits; treat expiry/depletion as a hard planning constraint |
| Primary Region | `eu-central-1` (Europe/Frankfurt) for staging and production application resources |
| Root user | Passkey/MFA protected, no access keys, emergency/account-only use |
| Human administrator | `sevi-admin`, temporary browser-authenticated AWS CLI sessions, no long-lived access keys |
| Agent inspection | `LongevityAgentViewOnly` assumed role with `ViewOnlyAccess` and one-hour sessions |
| Agent Toolkit | AWS MCP pinned to the Frankfurt endpoint and the view-only profile |
| Cost control | Monthly AWS Budget alert plus manual credit/billing review; neither is a hard cap |

Do not enable AWS Organizations merely as an IAM convenience while this account
must retain its Free-plan promotional credits: the current Free plan terms make
joining or creating an organization an account upgrade that expires those
credits. A single-account IAM model is sufficient for the MVP learning phase.

Identity boundaries are deliberately separate:

- `longevity-staging` is only the local administrator profile alias; it is not an environment or permission boundary.
- `longevity-agent-viewonly` assumes `LongevityAgentViewOnly` and is the profile bound to the AWS MCP.
- a future GitHub Actions deployment identity must use GitHub OIDC and a narrowly scoped staging-deployment role.
- production deployment must have a separate role and approval boundary rather than reusing either `sevi-admin` or the staging role.

The AWS MCP is currently configured in proxy `--read-only` mode. This permits
AWS documentation and regional-availability discovery but intentionally hides
generic live-resource API calls. If live inventory becomes necessary, retain
the IAM role's `ViewOnlyAccess` and remove only the proxy restriction. For
resource creation, use reviewed CLI/console steps during the manual staging
exercise, then replace them with Terraform and scoped deployment roles.

Staging runtime identity and secret contract:
- the human `sevi-admin` identity starts an audited Systems Manager session; it
  is not the Django runtime identity
- the EC2 host receives a separate instance-profile role with
  `AmazonSSMManagedInstanceCore` and `secretsmanager:GetSecretValue` restricted
  to `longevity/staging/backend-runtime`; add `kms:Decrypt` only when a
  customer-managed KMS key encrypts that secret
- the host-side loader explicitly ignores workstation profiles, shared AWS
  credential/config files, static/session credentials, web identity, and
  container credential endpoints; the EC2 metadata role is its credential path
- the loader retrieves one `AWSCURRENT` JSON value and passes the validated
  allowlisted snapshot to one deployment command without a persistent `.env`
- the secret values still exist in process/container memory and are visible to
  privileged host or Docker operators; restrict Systems Manager, sudo, and
  Docker access and never print the secret or unredacted Compose configuration
- `longevity/staging/backend-runtime` is a defined future resource, not evidence
  that Secrets Manager or EC2 has already been provisioned

Infrastructure progression:

1. Manually provision presentation staging:

- CloudFront as the only public application entry, with private S3/OAC for the React build and uncached `/api/*` forwarding
- one public `t4g.small` EC2 Docker host with an Elastic IP; no ALB or NAT Gateway
- EC2 ingress on TCP 443 only from the CloudFront origin-facing prefix list; no public SSH, Gunicorn, or PostgreSQL port
- Nginx origin TLS and reverse proxy, with a secret CloudFront origin header
- automated Let's Encrypt certificate issuance/renewal through Route 53 DNS-01
- long-lived Django API container plus a one-off migration container from the same immutable image
- plain PostgreSQL 16 container with data on encrypted persistent EBS;
  TimescaleDB is deferred until measured need justifies a tested migration
- scheduled, monitored `pg_dump` backups to a private encrypted versioned S3 bucket and a tested restore procedure
- Secrets Manager, an EC2 instance role, and least-privilege IAM permissions
- AWS Systems Manager access instead of a publicly exposed SSH administration path
- CloudWatch log groups and infrastructure metrics
- private S3 frontend bucket with Block Public Access and CloudFront Origin Access Control
- ACM viewer certificate for CloudFront in `us-east-1`; Let's Encrypt certificate on Nginx for the origin hostname
- Gunicorn as the production WSGI server behind Nginx

2. Encode the recommended production topology in Terraform before real users:

- preserve separate staging and production domains, databases, secrets, and Stripe modes
- use CloudFront/WAF, an ALB across two AZs, two private Fargate API tasks, and RDS PostgreSQL Multi-AZ with point-in-time recovery
- provide resilient private-task egress with one NAT Gateway per AZ
- make production reproducible and avoid copying the staging host's colocated database failure domain
- keep application release automation separate from infrastructure provisioning

3. Introduce asynchronous resources only after a measured requirement:

- ElastiCache Redis
- ECS Fargate Celery Worker
- exactly one ECS Fargate Celery Beat scheduler unless a future distributed scheduler replaces it
- S3 for logical backup artifacts, exports, repair outputs, or application media

Do not provision Redis and worker tasks merely because they exist in local
Compose. The bounded wearable endpoint is currently synchronous and does not
depend on them.

### 7.2 CI/CD (GitHub Actions)

Current implemented state:
- backend CI is now implemented in `.github/workflows/backend-ci.yml`
- backend and frontend CI pin the GitHub-hosted runner to `ubuntu-24.04` rather
  than inheriting future `ubuntu-latest` migrations
- it uses:
  - `actions/checkout` v7.0.1;
  - `actions/setup-python` v7.0.0;
  - `astral-sh/setup-uv` v10.2.0;
  - immutable full commit SHAs, with release comments, rather than mutable
    floating action tags
- it currently runs:
  - `uv sync --group dev`
  - `uv run ruff check .`
  - `uv run mypy`
  - `uv run pytest tests` against a healthy PostgreSQL 16 service
  - `scripts/smoke_prod_image.sh`
  - `uv run python -m scripts.smoke_production_deployment` with a ten-minute
    timeout
- PostgreSQL is required in CI because concurrency coverage depends on real
  row locks; the 2026-09-23 gate passed all `462` backend tests and the complete
  migration/API smoke
- frontend CI uses Node.js 24 and pins `actions/checkout` v7.0.1 and
  `actions/setup-node` v7.0.0 to immutable full commit SHAs
- both workflows run on every pull request so `backend` and `frontend` can be
  made required branch-protection checks without leaving docs-only pull
  requests permanently pending; their push triggers remain path-filtered to
  avoid unnecessary branch runs
- this is CI only, not CD
- no deployment pipeline is implemented yet

```yaml
# .github/workflows/backend-ci.yml (simplified)
name: Backend CI
on: [push, pull_request, workflow_dispatch]
jobs:
  backend:
    runs-on: ubuntu-24.04
    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_DB: longevity_ci
          POSTGRES_USER: postgres
          POSTGRES_PASSWORD: postgres
    env:
      DATABASE_URL: postgresql://postgres:postgres@127.0.0.1:5432/longevity_ci
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
      - uses: actions/setup-python@5fda3b95a4ea91299a34e894583c3862153e4b97 # v7.0.0
      - uses: astral-sh/setup-uv@c18668ad3cf93ea998bef934396af7bb5c839dc7 # v10.2.0
      - run: uv sync --group dev
      - run: uv run ruff check .
      - run: uv run mypy
      - run: uv run pytest tests
      - run: ./scripts/smoke_prod_image.sh
      - run: uv run python -m scripts.smoke_production_deployment
```

Practical note from the current project:
- local Docker tests use the containerized stack
- GitHub Actions runs Python on the runner and connects Django tests to its
  PostgreSQL 16 service through an explicit `DATABASE_URL`
- raw SQL tests should avoid depending on database-specific storage details when CI and local environments differ
- CI intentionally has no Redis service because the current server request path
  does not require Redis/Celery; add one only with a real integration contract
- PostgreSQL-specific concurrency tests must not fall back to SQLite because
  SQLite does not implement the row-lock semantics being asserted
- CD is still unimplemented; the first pipeline should target staging before production
- the EC2 staging pipeline should authenticate to AWS through GitHub OIDC rather than long-lived AWS keys
- Terraform provisions infrastructure; the deployment pipeline ships a tested application version onto that infrastructure
- deployment must stop when the one-off migration container fails
- staging promotion should require the public liveness check and database readiness check to pass; production additionally requires the ALB health check
- the approved deployment policy permits a short maintenance interruption while
  the single API container is replaced; blue/green, rolling, and other
  zero-downtime promotion mechanisms are not planned requirements
- frontend deployment should publish immutable assets before the browser smoke test
- Android staging builds should use a public HTTPS staging base URL and a private distribution channel such as Play Internal Testing; API base URLs are configuration, not secrets

### 7.3 Containers
- Single backend `Dockerfile` (multi-stage: build → production runtime)
- Docker Compose for local development
- Docker Engine and Compose on manually provisioned EC2 for initial staging
- the same immutable image for `python manage.py migrate --no-input` before the
  Django container is replaced; `uv` remains in build/development stages only
- `docker-compose.production-smoke.yml` and
  `scripts.smoke_production_deployment` exercise that migration-first contract
  with an inert snapshot and disposable database in local and GitHub CI
- Terraform-managed ALB, two Fargate API tasks, one-off migration task, and RDS Multi-AZ for real production users
- Celery Worker and Beat tasks only when measured server workloads justify them
- no Kubernetes for the MVP; its operational cost is unjustified for a solo deployment

Celery Worker, Celery Beat, migrations, and artifact-producing jobs are ordinary
process/container roles and are not specific to Fargate. They could run on EC2;
the project intentionally defers them until post-MVP because current product
requests do not require server-side asynchronous processing.

Logging note:
- local and deployed containers should prefer stdout/stderr logging
- do not default to writing Django logs to local files inside containers
- let Docker handle local log collection and CloudWatch handle the MVP cloud sink later

### 7.4 Secrets
See §3.6.

### 7.5 Backups

> [!IMPORTANT]
> **Yes, backups from day 1.** Presentation staging needs a monitored logical
> backup and restore drill because its database is self-hosted. Production uses
> managed RDS backups and point-in-time recovery, also with restore exercises.

| What | How | Retention |
|---|---|---|
| Staging database | Scheduled `pg_dump` to private encrypted versioned S3 | Define in the runbook; monitor every run and test restoration |
| Production database | RDS automated backups and point-in-time recovery | Define and verify before accepting real users |
| Terraform state / local-development `.env` | Terraform Cloud or S3 + versioning for state; ignored workstation storage for local `.env` | Indefinite for state; local `.env` is not a production backup artifact |
| User uploads (if any) | S3 with versioning | Indefinite |

The Django API process does not own backups. A separate host-scheduled container
creates staging dumps and reports success/failure. Record retention, protect the
bucket from public access, and perform a restore drill before calling staging
recoverable. Production backup retention and restoration belong to the RDS
operational boundary.
