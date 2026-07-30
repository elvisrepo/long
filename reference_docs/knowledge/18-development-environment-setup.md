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
**Current scope:** Docker Compose hosts the backend services. The implemented Android companion project runs separately through Android Studio/Gradle on the host and installs debug/test APKs on a physical phone through `adb`.

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
├── android/          # Implemented Kotlin/Compose companion app (R2/R3 in progress)
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

Android companion development:

```text
Android Studio: /opt/android-studio
Android SDK:    /home/sevi/Android/Sdk
ADB:            /home/sevi/Android/Sdk/platform-tools/adb
Project:        /home/sevi/longevity/android
Application ID: com.viridiandome.longevity
Minimum SDK:    28
Compile SDK:    37.1
Target SDK:     36
```

- Do not run `git init` inside `android/`; the companion app is part of the root repository.
- `android/local.properties`, `.gradle/`, `.idea/`, and build outputs stay ignored; commit the Gradle wrapper and application sources.
- Use Android Studio's bundled JDK for reproducible command-line builds:

```bash
cd /home/sevi/longevity/android
JAVA_HOME=/opt/android-studio/jbr ./gradlew testDebugUnitTest
JAVA_HOME=/opt/android-studio/jbr ./gradlew connectedDebugAndroidTest
```

- `connectedDebugAndroidTest` uses `adb` to build/install the app and test APKs, start AndroidJUnitRunner, and report device results.
- Keep the physical phone awake and unlocked during instrumented Compose tests.
- The current `LoginScreenPreview` can be rendered from Android Studio's Split/Design editor without a phone.
- The debug app does not call Django yet. The next networking slice will add debug-only local HTTP configuration and `adb reverse tcp:8000 tcp:8000`; production remains HTTPS-only.

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
- the normal frontend dev flow uses Vite on `http://127.0.0.1:5173` with a dev proxy from `/api/*` to Django on `http://127.0.0.1:8000`.
- Playwright now starts a dedicated E2E backend runtime through Docker Compose:
  - frontend: Vite dev server on `http://127.0.0.1:5173`
  - backend: Django running with `config.settings.e2e`, exposed on host port `8001`
  - database: Docker Postgres service `db-e2e`, database `longevity_e2e`, exposed on host port `5433`
- Vite's E2E proxy target is set with `VITE_API_PROXY_TARGET=http://127.0.0.1:8001`.
- Playwright calls `POST /api/testing/reset/` before the auth smoke test so browser tests do not write into the normal local development database.

Example local auth-related `.env` values:
```bash
PII_ENCRYPTION_KEY=replace-with-a-valid-fernet-key
EMAIL_LOOKUP_KEY=
CSRF_TRUSTED_ORIGINS=http://127.0.0.1:5173,http://localhost:5173
```

Local container reminder:
- when `backend/docker-compose.yml` loads values through `env_file`, changing `.env` may require recreating the web container, not just restarting it, so the updated environment is actually applied.

Local subscription repair:
- New registrations atomically create an active Free subscription, but older local users created before subscriptions existed may be missing a current subscription row.
- A missing current subscription is invalid application state; runtime code intentionally does not silently fall back to Free.
- Inspect the repair impact first:
```bash
cd backend
docker compose exec web uv run python manage.py backfill_free_subscriptions --dry-run
```
- Apply the repair to create active Free subscriptions for users without any current subscription:
```bash
docker compose exec web uv run python manage.py backfill_free_subscriptions
```
- Inspect local users and subscription history through Django shell:
```bash
docker compose exec web uv run python manage.py shell
```
```python
from django.contrib.auth import get_user_model
from apps.subscriptions.models import Subscription

User = get_user_model()

User.objects.count()
Subscription.objects.count()

for user in User.objects.all():
    print(user.id, user.email, list(user.subscriptions.values("id", "plan__code", "status")))
```

Local Stripe Checkout plan seeding:
- The plan catalog only shows paid upgrade options when the local database has an active non-default `SubscriptionPlan` with at least one active `SubscriptionPrice`.
- Seed local Pro plan rows with:
```bash
cd backend
docker compose exec web uv run python manage.py seed_dev_subscription_plans
```
- The seed command creates placeholder Stripe provider price IDs. Replace them with real Stripe sandbox Price IDs before testing actual Checkout redirects. These IDs start with `price_...`; never use `sk_test_...` secret keys as price IDs.
- Example local update after creating monthly and yearly test prices in the Stripe dashboard:
```bash
docker compose exec web uv run python manage.py shell -c "
from apps.subscriptions.models import SubscriptionPrice

SubscriptionPrice.objects.filter(
    billing_interval='month',
    unit_amount=1000,
).update(provider_price_id='price_1Tl5ZXF5wYJKUxPez2sVOkBQ')

SubscriptionPrice.objects.filter(
    billing_interval='year',
    unit_amount=10000,
).update(provider_price_id='price_1Tl5aCF5wYJKUxPelMMkcDrg')
"
```
- The frontend receives only internal `SubscriptionPrice.id` values from `/api/v1/subscriptions/plans/`; Django uses `provider_price_id` server-side when creating the Stripe Checkout Session.

Local Stripe Customer Portal setup:
- Set `STRIPE_CUSTOMER_PORTAL_RETURN_URL=http://localhost:5173/settings` in the ignored backend `.env`; `.env.example` contains the non-secret local default.
- Configure and save the Customer Portal separately in the Stripe sandbox Dashboard. Sandbox configuration does not configure live mode.
- Initially enable cancellation and payment-method management only. Keep subscription plan switching disabled until local price-change reconciliation is implemented.
- `POST /api/v1/subscriptions/portal/` requires an authenticated user with a local Stripe `BillingCustomer` and returns a short-lived `billing.stripe.com` URL.

### 3.6 Secrets Management

| Environment | Strategy |
|---|---|
| **Local** | `.env` file (in `.gitignore`), `.env.example` committed |
| **CI** | GitHub Actions secrets (encrypted) |
| **Production** | AWS Secrets Manager, injected at runtime via IAM roles |
| **Never** | Hardcoded in code, committed to git, in Docker image layers |
