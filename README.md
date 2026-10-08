# Longevity

Longevity is a health and wellness tracking app with a React web client, Django
REST API, and Android companion app. It brings together personal metrics,
workouts, diet, recovery, subscription settings, and Health Connect sync.

## Project status

- The public AWS environment is **presentation staging**, intended for demo and
  test data—not real-user production data.
- The current staging deployment is deliberately a small, single-host setup.
  It is not highly available.
- A separate multi-AZ production architecture is documented below, but it is a
  future recommendation and is not deployed. Its cost is above the current
  $15/month AWS budget.

## Architecture

These Mermaid diagrams are compact summaries for this page. The canonical C4
model, including detailed deployment views, is
[`longevity-architecture.dsl`](reference_docs/knowledge/diagrams/longevity-architecture.dsl).
The current AWS staging snapshot and its change history are indexed in
[`current_aws/README.md`](reference_docs/knowledge/diagrams/current_aws/README.md).

### Local development

<details>
<summary>Show local development architecture</summary>

```mermaid
flowchart TB
    subgraph PHONE["Physical Android Phone"]
        localSamsungHealth["Samsung Health"]
        localAndroidClient["Android Companion App"]
        localHealthConnect["Health Connect"]
    end

    subgraph DEV["Developer Machine"]
        androidTooling["Android Studio + Gradle + adb"]
        adbReverse["adb reverse Tunnel"]
        stripeCli["Stripe CLI Listener"]
        subgraph BROWSER["Browser"]
            localBrowser["Local Web Browser"]
            localWebapp["React Web App"]
        end
        viteServer["Vite Dev Server<br/>assets + /api proxy"]
        subgraph DOCKER["Docker Compose"]
            localApi["Django API<br/>(container)"]
            localDb[("PostgreSQL / TimescaleDB<br/>(container)")]
        end
    end

    localAndroidClient <-->|"adb over USB<br/>install · run · debug"| androidTooling
    localAndroidClient -->|"localhost:8000"| adbReverse
    adbReverse -->|":8000"| localApi
    localSamsungHealth -->|"writes"| localHealthConnect
    localAndroidClient -->|"reads"| localHealthConnect
    localBrowser -->|"loads assets"| viteServer
    localWebapp <-->|"/api calls"| viteServer
    viteServer -->|"proxy :8000"| localApi
    stripeCli -->|"webhooks"| localApi
    localApi -->|"reads / writes"| localDb

    localHealthConnect ~~~ androidTooling
    localHealthConnect ~~~ adbReverse
    localHealthConnect ~~~ stripeCli
    localHealthConnect ~~~ localBrowser
    localHealthConnect ~~~ localWebapp

    classDef browser fill:#c8e6c9,stroke:#2e7d32,color:#1b3a1e,stroke-width:2px
    classDef proxy fill:#bbdefb,stroke:#1565c0,color:#0d2f5c,stroke-width:2px
    classDef stripe fill:#ffe0b2,stroke:#e65100,color:#4a2400,stroke-width:2px
    classDef tooling fill:#e1bee7,stroke:#6a1b9a,color:#2e0a3d,stroke-width:2px
    classDef android fill:#fff59d,stroke:#f9a825,color:#4a3b00,stroke-width:2px
    classDef health fill:#f8bbd0,stroke:#c2185b,color:#4a0f26,stroke-width:2px
    classDef api fill:#1565c0,stroke:#0d47a1,color:#ffffff,stroke-width:2px
    classDef db fill:#b2ebf2,stroke:#00838f,color:#00363d,stroke-width:2px

    class localBrowser,localWebapp browser
    class viteServer proxy
    class stripeCli stripe
    class androidTooling,adbReverse tooling
    class localAndroidClient android
    class localHealthConnect,localSamsungHealth health
    class localApi api
    class localDb db

    style DEV fill:#f4f7fb,stroke:#6f8aa6,stroke-width:2px
    style BROWSER fill:#eef8ec,stroke:#6ea36a
    style DOCKER fill:#edf2ff,stroke:#6980c7,stroke-width:2px
    style PHONE fill:#fffbe6,stroke:#f9a825,stroke-width:2px

    linkStyle 0,1,2 stroke:#6a1b9a,stroke-width:3px
    linkStyle 3,4 stroke:#c2185b,stroke-width:3px
    linkStyle 5,6,7 stroke:#2e7d32,stroke-width:3px
    linkStyle 8 stroke:#e65100,stroke-width:3px
    linkStyle 9 stroke:#00838f,stroke-width:3px
```
</details>

For the canonical C4 view, open [`longevity-architecture.dsl`](reference_docs/knowledge/diagrams/longevity-architecture.dsl)
in [Structurizr Playground](https://playground.structurizr.com/) and select
**Local Development** (`local-development-compact`).


### Current AWS staging

<details>
<summary>Show current AWS staging architecture</summary>

```mermaid
flowchart LR
  user[Browser or Android app] -->|HTTPS| edge[CloudFront]
  edge -->|static assets via OAC| frontend[Private S3 frontend bucket]
  edge -->|uncached /api/* over HTTPS| nginx[Nginx TLS proxy<br/>single EC2 host]
  subgraph host[One EC2 t4g.small host — one failure domain]
    nginx -->|private Docker network| api[Gunicorn and Django API]
    api --> db[(PostgreSQL 16)]
    db --- ebs[Encrypted EBS data volume]
    backup[Scheduled pg_dump job] -->|reads| db
  end
  backup -->|encrypted backup files| backupbucket[Private S3 backup bucket]
  ops[Systems Manager and CloudWatch] -.-> host
  secrets[AWS Secrets Manager] -.-> host
```
</details>

This environment is for presentation and test data. CloudFront and backups do
not remove the EC2 host as a single point of failure. See the
[`V018 current AWS diagram`](reference_docs/knowledge/diagrams/current_aws/v018-automated-backup-restore-monitoring.dsl)
for the verified backup, restore, and monitoring details.

### Future recommended production

<details>
<summary>Show future recommended production architecture</summary>

```mermaid
flowchart LR
  clients[Browser and Android clients] --> edge[CloudFront and AWS WAF]
  edge -->|static| frontend[Private S3 frontend bucket]
  edge -->|API| alb[HTTPS Application Load Balancer]
  alb --> tasks
  subgraph tasks[Private ECS Fargate tasks across two AZs]
    taska[Django API task A]
    taskb[Django API task B]
  end
  taska --> db[(Amazon RDS PostgreSQL Multi-AZ)]
  taskb --> db
  db -->|synchronous replication| standby[Standby and automatic failover]
  taska -.-> secrets[AWS Secrets Manager]
  taskb -.-> secrets
  taska -.-> monitor[CloudWatch logs and alarms]
  taskb -.-> monitor
```
</details>

This is a future target, not a deployment plan for the current budget. It omits
some supporting details for readability; the full recommended production view
in the canonical C4 model also includes migrations, private-task egress, and
security boundaries.

## Run locally

Prerequisites: Docker Engine with Compose, `uv`, Node.js/npm, and (for Android
development) Android Studio with the Android SDK.

Start the backend from one terminal:

```bash
cd backend
cp .env.example .env
# Replace the example-only secret and encryption values in .env.
docker compose up --build
```

See the [development setup guide](reference_docs/knowledge/18-development-environment-setup.md)
for valid local key formats and environment-variable details.

Start the frontend from another terminal:

```bash
cd frontend
npm ci
npm run dev
```

Open the local URL printed by Vite. The frontend proxies `/api` requests to the
backend on port `8000`. Keep `.env` local; never use these development settings
for a deployed environment.

## Checks

```bash
cd backend
docker compose exec web uv run pytest tests
```

```bash
cd frontend
npm ci
npm test
npm run lint
npm run build
```

For Android unit tests, run `./gradlew --no-daemon testDebugUnitTest` from
`android/`. The [development setup guide](reference_docs/knowledge/18-development-environment-setup.md)
also covers device setup; the [frontend README](frontend/README.md) describes
browser end-to-end tests.

## Repository map

- `backend/` — Django REST API, database models, migrations, and backend tests.
- `frontend/` — React + TypeScript app, browser tests, and static deployment.
- `android/` — Kotlin/Jetpack Compose companion app and Health Connect sync.
- `reference_docs/` — project decisions, operations guides, and architecture
  source diagrams.
- `.github/workflows/` — CI and staging deployment workflows.

## Staging

The presentation environment is available at [staging.syncvitals.space](https://staging.syncvitals.space).
Treat it as a demo/test environment; do not enter real health data.
