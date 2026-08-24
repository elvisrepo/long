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
- The debug build permits local cleartext HTTP while the main/release manifest remains HTTPS-only.
- After connecting the authorized phone, run `adb reverse tcp:8000 tcp:8000` so `http://127.0.0.1:8000` on the phone reaches local Django. This mapping is temporary and may need to be recreated after reconnecting the phone or restarting ADB.
- The debug build sets `BuildConfig.API_BASE_URL` to `http://127.0.0.1:8000/`; this is useful only with the `adb reverse` mapping above. The release URL remains deliberately unset until an HTTPS production API exists.
- `HttpAuthRepository` implements and mock-server-tests the mobile-login HTTP contract. `AndroidKeystoreAuthTokenStore` provides the production AES-GCM/Android-Keystore storage boundary and is verified on the physical phone.
- `LongevityApplication` creates the shared HTTP/auth dependencies. `MainActivity` obtains `LoginViewModel` through `LoginViewModelFactory`, collects its state with lifecycle awareness, and delegates Sign in to the real repository.

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
- The `web-e2e` process receives fixed inert Stripe values before Django starts,
  `config.settings.e2e` replaces the inherited Stripe settings again, and
  `STRIPE_OUTBOUND_API_ENABLED=False` prevents Checkout or Customer Portal SDK
  clients from being constructed. Valid developer sandbox keys in `.env` are
  therefore neither used nor retained as the E2E Stripe configuration.
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
- `docker compose config` renders the fully resolved Compose model and may print values loaded from `.env` or `env_file`. Do not paste or retain its unredacted output in logs, tickets, or chat. Prefer scoped metadata commands such as `docker compose config --services` or `docker compose config --images`; if full output is unavoidable, redact it before sharing.

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

Treat credentials printed into any captured command output as disclosed and
rotate them. Removing the source file or later deleting the terminal text does
not invalidate a credential that another system may already have retained.

### 3.7 AWS CLI and Agent Toolkit workstation setup

Current local tooling checkpoint (2026-08-20):

- AWS CLI v2 is installed on Fedora (`aws-cli/2.36.27` at the checkpoint).
- The application Region is `eu-central-1` (Europe/Frankfurt).
- The root user is protected by a passkey/MFA, has no access keys, and is not used for normal work.
- The human administrator is the console-enabled IAM user `sevi-admin`. It has no long-lived access keys.
- The account is on the AWS Free plan with promotional credits. Do not enable AWS Organizations or join an organization without first accepting that this upgrades the account and ends the Free-plan credits.
- A monthly AWS Budget alert exists. A budget is an alert, not a hard spending cap, and its cost data is not instantaneous.

#### Temporary human CLI session

`longevity-staging` is a local AWS CLI profile name. It currently authenticates
as `sevi-admin`; the name does **not** create a staging environment and does not
limit that user's administrator permissions.

```bash
aws configure set region eu-central-1 --profile longevity-staging
aws login --profile longevity-staging --region eu-central-1
aws sts get-caller-identity --profile longevity-staging
```

Persist the Region once as shown above. Supplying `--region` during login alone
does not necessarily write a default Region into the profile, and commands that
omit it can otherwise fail with `NoRegion`.

`aws login` uses a browser sign-in and stores refreshable temporary session data
under the user's AWS CLI configuration/cache directories. It avoids static IAM
access keys. Renew an expired session by running the same `aws login` command;
end it explicitly with:

```bash
aws logout --profile longevity-staging
```

Never commit `~/.aws/config`, `~/.aws/login/cache/`, credentials, account IDs,
role-session output, or copied tokens to this repository.

#### Read-only agent role and profile

The IAM role `LongevityAgentViewOnly` has AWS-managed `ViewOnlyAccess`, trusts
only the intended administrator principal to call `sts:AssumeRole`, and uses a
one-hour maximum role session. The corresponding local profile is conceptually:

```ini
[profile longevity-agent-viewonly]
role_arn = arn:aws:iam::<account-id>:role/LongevityAgentViewOnly
source_profile = longevity-staging
role_session_name = codex-viewonly
region = eu-central-1
output = json
```

Verify that the returned ARN contains `assumed-role/LongevityAgentViewOnly/`
before using it for agent-assisted AWS inspection:

```bash
aws sts get-caller-identity --profile longevity-agent-viewonly
```

The role does not downgrade `sevi-admin` globally. A command that explicitly
uses `longevity-staging` still has the human administrator's authority. Keep
agent integrations bound to `longevity-agent-viewonly`, preserve command
approvals, and create a separate narrowly scoped deployment role before any
agent or CI system is allowed to change cloud resources.

#### Agent Toolkit for AWS

The Agent Toolkit was installed with AWS CLI 2.35+:

```bash
aws configure agent-toolkit
```

The installer currently requires `us-east-1`; that is only the toolkit setup
control-plane requirement and does not change the application's Frankfurt
Region. The generated MCP command was replaced because it omitted the explicit
profile, workload Region, and safety mode. The intended global Codex MCP command
is:

```bash
codex mcp add aws-mcp -- \
  uvx \
  mcp-proxy-for-aws==1.6.4 \
  https://aws-mcp.eu-central-1.api.aws/mcp \
  --profile longevity-agent-viewonly \
  --region eu-central-1 \
  --read-only \
  --metadata AWS_REGION=eu-central-1 INSTALL_SOURCE=aws-cli
```

Inspect it with `codex mcp get aws-mcp`. In this initial `--read-only` proxy
mode, the MCP exposes documentation, Region availability, skills, and task
status tools but hides generic AWS API/script execution. This is safer for
learning, but it also means the MCP cannot inspect live account resources. If
live read-only inspection is needed later, remove the proxy's `--read-only`
switch while retaining the IAM role's `ViewOnlyAccess`; IAM remains the actual
AWS-enforced permission boundary.

The Toolkit installed AWS-focused global skills under `~/.agents/skills`.
Unrelated global Google ADK skills were moved to a reversible disabled-skills
directory, and the unrelated Vercel plugin/MCP was removed, keeping the active
global capability surface relevant to this project.
