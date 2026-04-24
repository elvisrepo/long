## 3. Development Environment Setup

## Use When
- Load this when you need local development setup, version control expectations, Docker Compose services, planned project structure, dev tools, environment variables, or secrets handling.

## Source
- Derived from `reference_docs/knowledge/planning.md` section 3.

### 3.1 Version Control
```bash
git init
# GitHub repo with branch protection on main
# PRs required, CI must pass before merge
```

### 3.2 Docker Compose
**Current scope:** Docker Compose covers the backend development loop for the manual-entry foundation phase. Samsung sync work adds an Android companion app and emulator/device setup later, but that is intentionally separate from the backend topology described here.

```yaml
# docker-compose.yml (simplified)
services:
  web:
    build: .
    ports: ["8000:8000"]
    env_file: .env
    depends_on: [db, redis]

  db:
    image: timescale/timescaledb:latest-pg16
    ports: ["5432:5432"]
    volumes: [pgdata:/var/lib/postgresql/data]
    environment:
      POSTGRES_DB: longevity
      POSTGRES_PASSWORD: ${DB_PASSWORD}

  redis:
    image: redis:7-alpine
    ports: ["6379:6379"]

  celery:
    build: .
    command: celery -A config worker -l info
    env_file: .env
    depends_on: [db, redis]

  celery-beat:
    build: .
    command: celery -A config beat -l info
    env_file: .env
    depends_on: [redis]

volumes:
  pgdata:
```

### 3.3 Project Structure
```
longevity/
├── config/           # Settings, URLs, ASGI, Celery
│   └── settings/     # base.py, dev.py, prod.py, test.py
├── android/          # Android companion app for Samsung sync (R2/R3+)
├── apps/
│   ├── accounts/       # User model, auth, profile, GDPR
│   ├── metrics/        # MetricDefinition, MetricEntry, analytics
│   ├── subscriptions/  # Stripe (R4+)
│   ├── wearables/      # Device-bridge sync first, aggregator/cloud integrations later
│   └── streaming/      # WebSocket consumers (R5+)
├── common/           # Shared utils, middleware, permissions
├── docker-compose.yml
├── Dockerfile
├── .env.example
├── .github/workflows/  # CI/CD
└── terraform/        # IaC (when ready for cloud)
```

### 3.4 Dev Tools
```
# pyproject.toml
[tool.ruff]        # Linter + formatter (replaces flake8 + black + isort)
[tool.pytest.ini_options]
[tool.mypy]        # Optional type checking

# Pre-commit hooks
- ruff (lint + format)
- mypy
- pip-audit (security)
```

### 3.5 Environment Variables
```bash
# .env.example (committed to git)
SECRET_KEY=change-me
DEBUG=True
DATABASE_URL=postgres://postgres:password@db:5432/longevity
REDIS_URL=redis://redis:6379/0
STRIPE_SECRET_KEY=sk_test_xxx
STRIPE_WEBHOOK_SECRET=whsec_xxx
SENTRY_DSN=
```

For MVP Samsung sync, the backend does **not** need Samsung cloud credentials because the Android companion app uploads data directly to our API after reading it on device.

Current local auth/runtime additions:
- `PII_ENCRYPTION_KEY` is required in backend runtime settings before any registration flow can persist encrypted email values.
- `EMAIL_LOOKUP_KEY` is optional; when unset, email lookup hashing falls back to `SECRET_KEY`.
- `CSRF_TRUSTED_ORIGINS` must include the frontend dev origin used by Vite for browser-based auth requests such as logout.
- the current frontend dev/E2E flow uses Vite on `http://127.0.0.1:5173` with a dev proxy from `/api/*` to Django on `http://127.0.0.1:8000`.
- the current Playwright auth smoke test uses the live local development stack, not a separate throwaway environment:
  - frontend: Vite dev server on `http://127.0.0.1:5173`
  - backend: Django running with `config.settings.dev`
  - database: Docker Postgres service `db`, database `longevity`
- Playwright registration currently creates real users in the local development database, so test emails must stay unique unless cleanup is added later.

Example local auth-related `.env` values:
```bash
PII_ENCRYPTION_KEY=replace-with-a-valid-fernet-key
EMAIL_LOOKUP_KEY=
CSRF_TRUSTED_ORIGINS=http://127.0.0.1:5173,http://localhost:5173
```

Local container reminder:
- when `backend/docker-compose.yml` loads values through `env_file`, changing `.env` may require recreating the web container, not just restarting it, so the updated environment is actually applied.

### 3.6 Secrets Management

| Environment | Strategy |
|---|---|
| **Local** | `.env` file (in `.gitignore`), `.env.example` committed |
| **CI** | GitHub Actions secrets (encrypted) |
| **Production** | AWS Secrets Manager, injected at runtime via IAM roles |
| **Never** | Hardcoded in code, committed to git, in Docker image layers |
