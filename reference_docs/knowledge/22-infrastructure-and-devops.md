## 7. Infrastructure & DevOps

## Use When
- Load this when you need infrastructure planning, CI/CD design, container strategy, secrets handling at the infrastructure level, or production backup policy.

## Source
- Derived from `reference_docs/knowledge/planning.md` section 7.

### 7.1 IaC (Terraform)

> [!NOTE]
> Don't write Terraform until ready to deploy to cloud. But **do plan** the resources upfront.

Terraform should be introduced in two deliberate phases.

Initial staging resources:

- VPC, subnets, security groups, public DNS, and an ACM-backed HTTPS ALB
- ECS Fargate Django API service
- one-off ECS migration-task definition using the same Django image
- Timescale Cloud service and provider-managed automated backups
- Secrets Manager and least-privilege IAM roles
- CloudWatch log groups and infrastructure metrics
- frontend hosting/CDN after choosing Vercel or S3 plus CloudFront

Evolved worker-enabled resources, added only when justified:

- ElastiCache Redis
- ECS Fargate Celery Worker
- ECS Fargate Celery Beat
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
      - uses: actions/setup-python@v5
      - run: pip install -r requirements/dev.txt
      - run: ruff check .
      - run: pytest --cov --cov-fail-under=80
      - run: pip-audit

  deploy-staging:
    needs: test
    if: github.ref == 'refs/heads/main'
    steps:
      - # Build Docker image
      - # Push to ECR
      - # Run one-off ECS migration task and require a zero exit code
      - # Deploy/promote the ECS API service
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
- deployment must stop when the one-off migration task fails
- service promotion should require the ALB health check and a public smoke test to pass
- frontend deployment should publish immutable assets before the browser smoke test
- Android staging builds should use a public HTTPS staging base URL and a private distribution channel such as Play Internal Testing; API base URLs are configuration, not secrets

### 7.3 Containers
- Single backend `Dockerfile` (multi-stage: build → production runtime)
- Docker Compose for local development
- ECS Fargate API service for initial staging
- the same immutable image for a one-off `python manage.py migrate --no-input` task before service promotion
- Celery Worker and Beat tasks only in the evolved worker-enabled deployment
- no Kubernetes for the MVP; its operational cost is unjustified for a solo deployment

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
