## 7. Infrastructure & DevOps

## Use When
- Load this when you need infrastructure planning, CI/CD design, container strategy, secrets handling at the infrastructure level, or production backup policy.

## Source
- Derived from `reference_docs/knowledge/planning.md` section 7.

### 7.1 IaC (Terraform)

> [!NOTE]
> Don't write Terraform until ready to deploy to cloud. But **do plan** the resources upfront.

Terraform manages:
- VPC + subnets + security groups
- Timescale Cloud service (PostgreSQL + TimescaleDB)
- ElastiCache (Redis)
- ECS Fargate (Django + Celery)
- S3 (backups, static files)
- Secrets Manager
- IAM roles
- CloudWatch log groups

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

  deploy:
    needs: test
    if: github.ref == 'refs/heads/main'
    steps:
      - # Build Docker image
      - # Push to ECR
      - # Deploy to ECS
```

Practical note from the current project:
- local Docker tests use the containerized stack
- GitHub Actions currently runs backend tests directly on the runner with the test settings fallback database
- raw SQL tests should avoid depending on database-specific storage details when CI and local environments differ
- the current backend CI job does not use Postgres or Redis services because the present test suite does not require them to pass
- this is a current-project simplification, not a permanent architectural assumption
- if future backend slices start depending on real Postgres or Redis behavior, CI should grow matching services instead of relying only on the runner environment

### 7.3 Containers
- Single `Dockerfile` (multi-stage: build → prod)
- Docker Compose for local dev (§3.2)
- ECS Fargate for cloud (not Kubernetes — overkill for solo dev)

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
| Database (extra) | `pg_dump` to S3 via Celery task (weekly) | 90 days |
| `.env` / Terraform state | Terraform Cloud or S3 + versioning | Indefinite |
| User uploads (if any) | S3 with versioning | Indefinite |
