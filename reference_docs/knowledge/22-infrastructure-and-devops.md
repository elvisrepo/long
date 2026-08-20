## 7. Infrastructure & DevOps

## Use When
- Load this when you need infrastructure planning, CI/CD design, container strategy, secrets handling at the infrastructure level, or production backup policy.

## Source
- Derived from `reference_docs/knowledge/planning.md` section 7.

### 7.1 IaC (Terraform)

> [!NOTE]
> Build staging manually once to learn the AWS resources, but document every step. Before accepting production users, reproduce the EC2 topology with Terraform so it can be reviewed and rebuilt.

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

Infrastructure progression:

1. Manually provision EC2 staging:

- VPC, subnets, security groups, public DNS, and an ACM-backed HTTPS ALB
- one EC2 application host using Docker Engine and Compose
- long-lived Django API container plus a one-off migration container from the same image
- Timescale Cloud service and provider-managed automated backups
- Secrets Manager, an EC2 instance role, and least-privilege IAM permissions
- AWS Systems Manager access instead of a publicly exposed SSH administration path
- CloudWatch log groups and infrastructure metrics
- frontend hosting/CDN after choosing Vercel or S3 plus CloudFront

2. Encode the same EC2 topology in Terraform before production:

- preserve separate staging and production domains, databases, secrets, and Stripe modes
- make production reproducible rather than copying a manually configured server
- keep application release automation separate from infrastructure provisioning

3. Introduce post-MVP Fargate resources after the EC2 learning phase:

- ECS Fargate Django API service and one-off migration task
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
- it uses:
  - `actions/checkout`
  - `actions/setup-python`
  - `astral-sh/setup-uv`
- it currently runs:
  - `uv sync --group dev`
  - `uv run ruff check .`
  - `uv run mypy`
  - `uv run pytest tests`
- this is CI only, not CD
- no deployment pipeline is implemented yet

```yaml
# .github/workflows/ci.yml (simplified)
name: CI
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: timescale/timescaledb:latest-pg16
      redis:
        image: redis:7-alpine
    steps:
      - uses: actions/checkout@v4
      - uses: astral-sh/setup-uv@v6
      - run: uv sync --group dev
      - run: uv run ruff check .
      - run: uv run mypy
      - run: uv run pytest tests

  deploy-staging:
    needs: test
    if: github.ref == 'refs/heads/main'
    steps:
      - # Build Docker image
      - # Push to ECR
      - # Use AWS Systems Manager to make staging EC2 pull that image
      - # Run the one-off Docker migration container and require a zero exit code
      - # Replace the Django API container
      - # Run public health and smoke checks
```

Practical note from the current project:
- local Docker tests use the containerized stack
- GitHub Actions currently runs backend tests directly on the runner with the test settings fallback database
- raw SQL tests should avoid depending on database-specific storage details when CI and local environments differ
- the current backend CI job does not use Postgres or Redis services because the present test suite does not require them to pass
- this is a current-project simplification, not a permanent architectural assumption
- if future backend slices start depending on real Postgres or Redis behavior, CI should grow matching services instead of relying only on the runner environment
- CD is still unimplemented; the first pipeline should target staging before production
- the EC2 staging pipeline should authenticate to AWS through GitHub OIDC rather than long-lived AWS keys
- Terraform provisions infrastructure; the deployment pipeline ships a tested application version onto that infrastructure
- deployment must stop when the one-off migration container fails
- service promotion should require the ALB health check and a public smoke test to pass
- frontend deployment should publish immutable assets before the browser smoke test
- Android staging builds should use a public HTTPS staging base URL and a private distribution channel such as Play Internal Testing; API base URLs are configuration, not secrets

### 7.3 Containers
- Single backend `Dockerfile` (multi-stage: build → production runtime)
- Docker Compose for local development
- Docker Engine and Compose on manually provisioned EC2 for initial staging
- the same immutable image for `docker compose run --rm web uv run python manage.py migrate --no-input` before the Django container is replaced
- Terraform-managed EC2 for the production MVP
- ECS Fargate API, migration, Celery Worker, and Beat tasks only in the post-MVP learning/evolution phase
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
> **Yes, backups from day 1 in production.** Use managed database backups plus periodic logical exports. The exact retention can vary by provider plan, so document the real numbers when provisioning.

| What | How | Retention |
|---|---|---|
| Database | Timescale Cloud automated backups | Provider-managed retention |
| Database (extra, later) | Deliberate scheduled `pg_dump` task to versioned S3 | Define before enabling; previous proposal was 90 days |
| `.env` / Terraform state | Terraform Cloud or S3 + versioning | Indefinite |
| User uploads (if any) | S3 with versioning | Indefinite |

The Django API process does not own database backups. Record the provisioned
Timescale Cloud retention and perform a restore drill before calling staging
production-ready. Do not add the extra logical-export job until there is a
durable scheduler and a tested restore procedure.
