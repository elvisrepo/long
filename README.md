# SyncVitals

SyncVitals is a health and wellness tracking app with a React web client, Django
REST API, and Android companion app. It brings together personal metrics,
workouts, diet, recovery, stretching and posture, AI suggestions, subscription
settings, and Health Connect sync.

This is an actively developed project with a live presentation-staging
environment. The production architecture below is a future recommendation.

## What you can track

- **Health metrics** — record values, review history and trends, and explore
  sleep and activity analytics.
- **Workouts** — log sets, reuse routines, browse your training calendar, and
  follow exercise progress and goals.
- **Daily habits** — check off diet, recovery, and stretching and posture
  activities.
- **AI suggestions** — request tracker-based suggestions and revisit saved
  reviews using a personal NVIDIA API key and explicit consent to share a
  tracker summary.
- **Android sync** — import supported Health Connect records through the
  companion app.

Subscription settings include Stripe Checkout and the billing portal; staging
uses Stripe test mode.

<details>
<summary>Show SyncVitals system context</summary>

<p align="center">
  <a href="docs/screenshots/readme/longevity-system-context.svg">
    <img src="docs/screenshots/readme/longevity-system-context.svg" alt="SyncVitals system context showing the user, Android phone and Health Connect, web and Android clients, API, PostgreSQL database, Stripe, and uptime monitoring" width="795">
  </a>
</p>
</details>

## Product preview

Mobile previews — click any image to open the full-resolution screenshot.
Most captures are from the local app; the AI Insights image is the supplied capture.

<p><a href="https://staging.syncvitals.space">Open the staging app</a> (sign-in required).</p>

<p align="center"><strong>Dashboard · Steps · Workouts</strong></p>

<p align="center">
  <a href="docs/screenshots/readme/dashboard.jpg"><img src="docs/screenshots/readme/dashboard.jpg" alt="SyncVitals mobile dashboard" title="Dashboard" width="200"></a>
  &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;
  <a href="docs/screenshots/readme/steps.jpg"><img src="docs/screenshots/readme/steps.jpg" alt="Mobile Steps metric history and trend" title="Steps" width="200"></a>
  &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;
  <a href="docs/screenshots/readme/workouts.jpg"><img src="docs/screenshots/readme/workouts.jpg" alt="Mobile workout log with recorded sets" title="Workouts" width="200"></a>
</p>

<details>
<summary>More previews: Diet, Recovery, Stretching &amp; Posture, and AI Insights</summary>

<p align="center"><strong>Diet · Recovery</strong></p>

<p align="center">
  <a href="docs/screenshots/readme/diet.jpg"><img src="docs/screenshots/readme/diet.jpg" alt="Mobile Diet food checklist" title="Diet" width="200"></a>
  &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;
  <a href="docs/screenshots/readme/recovery.jpg"><img src="docs/screenshots/readme/recovery.jpg" alt="Mobile Recovery activities" title="Recovery" width="200"></a>
</p>

<br>

<p align="center"><strong>Stretching &amp; Posture · AI Insights</strong></p>

<p align="center">
  <a href="docs/screenshots/readme/stretching.jpg"><img src="docs/screenshots/readme/stretching.jpg" alt="Mobile Stretching and Posture checklist" title="Stretching &amp; Posture" width="200"></a>
  &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;
  <a href="docs/screenshots/readme/ai-insights.png"><img src="docs/screenshots/readme/ai-insights.png" alt="AI Insights with model selection and weekly suggestions" title="AI Insights" width="200"></a>
</p>
</details>

## Architecture

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
            localRedis[("Redis<br/>AI queue · temporary job state")]
            localWorker["Celery AI worker<br/>(container)"]
            localBeat["Celery Beat<br/>No scheduled tasks configured"]
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
    localApi -->|"queues jobs / polls status"| localRedis
    localWorker -->|"consumes jobs / updates status"| localRedis
    localWorker -->|"reads keys / saves AI reviews"| localDb

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
    classDef async fill:#e1bee7,stroke:#6a1b9a,color:#2e0a3d,stroke-width:2px

    class localBrowser,localWebapp browser
    class viteServer proxy
    class stripeCli stripe
    class androidTooling,adbReverse tooling
    class localAndroidClient android
    class localHealthConnect,localSamsungHealth health
    class localApi api
    class localDb db
    class localRedis,localWorker,localBeat async

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

### Current AWS staging

The [verified V020 deployment model](reference_docs/knowledge/diagrams/current_aws/v020-ai-worker-live.dsl)
is the current staging architecture source. It includes private Redis, a Celery
worker for asynchronous AI suggestions, and the external NVIDIA inference API.
See the
[deployment guide](reference_docs/knowledge/23-production-deployment.md)
for the current runtime and its limits.

<details>
<summary>Show current AWS staging architecture</summary>

#### Request and data path

```mermaid
flowchart LR
    B["Browser"]
    M["Android companion<br/>Health Connect sync"]
    NVIDIA["NVIDIA API<br/>AI inference"]
    STRIPE["Stripe test mode<br/>Checkout · Portal · Webhooks"]

    subgraph AWS["AWS"]
        CF["CloudFront<br/>Route 53 alias · ACM viewer TLS"]
        FRONT["Private S3<br/>React frontend · Android APK"]
        IMAGES[("Private S3<br/>Custom stretch images")]

        subgraph VPC["Default VPC · 172.31.0.0/16"]
            subgraph EC2["EC2 · eu-central-1c · t4g.small ARM64<br/>One host / one failure domain"]
                NG["Host Nginx<br/>Origin TLS · CloudFront-only inbound<br/>Secret origin-header validation"]

                subgraph DOCKER["Docker Compose · private network"]
                    API["Django + Gunicorn<br/>host loopback :18000 → container :8000"]
                    REDIS[("Redis<br/>AI queue · encrypted temporary job state<br/>Shared auth rate-limit counters<br/>No host port · no persistence")]
                    WORKER["Celery AI worker<br/>Concurrency: 1"]
                    DB[("PostgreSQL 16<br/>App data · encrypted keys and saved reviews<br/>No host port")]
                end
            end

            EBS["Encrypted EBS<br/>Root + retained PostgreSQL data"]
        end
    end

    B -->|"HTTPS · app and API"| CF
    M -->|"HTTPS · authenticated sync API"| CF
    CF -->|"Static files · signed S3 reads"| FRONT
    CF -->|"/api/* · uncached HTTPS"| NG
    NG -->|"127.0.0.1:18000"| API

    API -->|"Read / write"| DB
    API -->|"Queue AI jobs · poll status<br/>Auth rate-limit counters"| REDIS
    WORKER -->|"Consume jobs · update status"| REDIS
    WORKER -->|"Read encrypted key<br/>Save encrypted review"| DB
    WORKER -->|"HTTPS · tracker summary<br/>Personal API key"| NVIDIA

    API -->|"Upload / read / delete<br/>Instance-role access"| IMAGES
    API -->|"Create Checkout / Portal sessions"| STRIPE
    B -->|"Hosted Checkout / Portal"| STRIPE
    STRIPE -->|"Signed webhook · HTTPS"| CF

    DB -->|"Persistent data"| EBS

    classDef client fill:#c8e6c9,stroke:#2e7d32,color:#1b3a1e,stroke-width:2px
    classDef edge fill:#bbdefb,stroke:#1565c0,color:#0d2f5c,stroke-width:2px
    classDef app fill:#1565c0,stroke:#0d47a1,color:#fff,stroke-width:2px
    classDef db fill:#b2ebf2,stroke:#00838f,color:#00363d,stroke-width:2px
    classDef storage fill:#f8bbd0,stroke:#c2185b,color:#4a0f26,stroke-width:2px
    classDef async fill:#e1bee7,stroke:#6a1b9a,color:#2e0a3d,stroke-width:2px
    classDef external fill:#ffe0b2,stroke:#e65100,color:#4a2400,stroke-width:2px

    class B,M client
    class CF,FRONT edge
    class NG,API app
    class DB db
    class EBS,IMAGES storage
    class REDIS,WORKER async
    class NVIDIA,STRIPE external

    style AWS fill:#f4f7fb,stroke:#6f8aa6,stroke-width:2px
    style VPC fill:#f4f7fb,stroke:#6f8aa6,stroke-width:2px
    style EC2 fill:#eef8ec,stroke:#6ea36a,stroke-width:2px
    style DOCKER fill:#edf2ff,stroke:#6980c7,stroke-width:2px
```

#### Host operations and supporting services

```mermaid
flowchart LR
    GH["GitHub Actions<br/>CI + staging deployment"]
    EMAIL["Operator email"]

    subgraph HOST["EC2 host · instance role"]
        DEPLOY["Deployment loader"]
        CERT["Certbot · systemd timer"]
        NG["Host Nginx"]
        BACKUP["Daily backup / monthly restore jobs"]
        MON["CloudWatch Agent"]
        subgraph DOCKER["Docker Compose"]
            API["Django + Gunicorn"]
            WORKER["Celery AI worker"]
            REDIS[("Redis")]
            DB[("PostgreSQL")]
        end
    end

    subgraph AWS["AWS services"]
        SSM["Systems Manager"]
        SM["Secrets Manager"]
        ECR["ECR"]
        FRONT["Private S3<br/>Frontend"]
        DNS["Route 53"]
        S3["Private S3<br/>PostgreSQL backups"]
        CW["CloudWatch<br/>Host / backup / restore metrics + alarms"]
        SNS["SNS"]
        SES["SES"]
    end

    GH -->|"OIDC · publish image"| ECR
    GH -->|"OIDC · publish frontend"| FRONT
    GH -->|"OIDC · deploy via Run Command"| SSM
    SSM --> DEPLOY

    DEPLOY -->|"Fetch AWSCURRENT"| SM
    DEPLOY -->|"Pull API / worker image"| ECR
    CERT -->|"DNS-01 challenge"| DNS
    CERT -.->|"Renew / reload"| NG

    API -->|"Queue jobs / cache"| REDIS
    WORKER -->|"Consume jobs / update status"| REDIS
    WORKER -->|"Save AI reviews"| DB

    BACKUP -->|"docker exec / pg_dump"| DB
    BACKUP -->|"Upload / restore read"| S3
    MON -->|"Host metrics"| CW
    BACKUP -->|"Backup / restore metrics"| CW
    CW --> SNS --> EMAIL
    API -->|"Email · instance role"| SES

    classDef ops fill:#e1bee7,stroke:#6a1b9a,color:#2e0a3d,stroke-width:2px
    classDef app fill:#1565c0,stroke:#0d47a1,color:#fff,stroke-width:2px
    classDef db fill:#b2ebf2,stroke:#00838f,color:#00363d,stroke-width:2px
    classDef email fill:#ffe0b2,stroke:#e65100,color:#4a2400,stroke-width:2px
    classDef edge fill:#bbdefb,stroke:#1565c0,color:#0d2f5c,stroke-width:2px

    class GH,SSM,DEPLOY,CERT,NG,BACKUP,MON,SM,ECR,DNS,CW,SNS ops
    class API,WORKER app
    class DB,REDIS db
    class EMAIL,SES email
    class S3,FRONT edge

    style HOST fill:#eef8ec,stroke:#6ea36a,stroke-width:2px
    style DOCKER fill:#edf2ff,stroke:#6980c7,stroke-width:2px
    style AWS fill:#f4f7fb,stroke:#6f8aa6,stroke-width:2px
```
</details>

### Future recommended production

<details>
<summary>Show future recommended production architecture</summary>

#### Request path and horizontal application capacity

```mermaid
flowchart LR
    B["Browser"]
    M["Android app"]
    NVIDIA["NVIDIA API<br/>AI inference"]
    STRIPE["Stripe<br/>Checkout · Portal · Webhooks"]

    subgraph AWS["AWS"]
        CF["CloudFront + AWS WAF"]
        S3["Private S3<br/>React frontend"]
        IMAGES[("Private S3<br/>Custom stretch images")]

        subgraph VPC["Production VPC · two Availability Zones"]
            ALB["Public ALB · spans AZs<br/>HTTPS · health-based routing"]

            subgraph AZA["Private app subnet · AZ-a"]
                A["ECS Fargate task A<br/>Django + Gunicorn"]
            end
            subgraph AZB["Private app subnet · AZ-b"]
                C["ECS Fargate task B<br/>Django + Gunicorn"]
            end

            WORKER["ECS Fargate worker service<br/>Celery AI jobs · private app subnets"]

            subgraph DATA["Private data subnets"]
                REDIS[("Managed Redis<br/>AI queue · temporary job state<br/>Shared auth rate-limit counters")]
                DB[("RDS PostgreSQL<br/>Multi-AZ primary")]
                STANDBY["Synchronous standby<br/>automatic failover"]
            end
        end
    end

    B -->|"HTTPS"| CF
    CF -->|"Static / SPA"| S3
    CF -->|"Uncached /api/* · HTTPS"| ALB
    M -->|"HTTPS · api.<domain>"| ALB
    ALB -->|"Healthy targets"| A
    ALB -->|"Healthy targets"| C
    A --> DB
    C --> DB
    A -->|"Queue jobs / cache"| REDIS
    C -->|"Queue jobs / cache"| REDIS
    WORKER -->|"Consume jobs / update status"| REDIS
    WORKER -->|"Read keys / save reviews"| DB
    WORKER -->|"HTTPS · tracker summary"| NVIDIA
    A -->|"Image storage"| IMAGES
    C -->|"Image storage"| IMAGES
    A -->|"Checkout / Portal"| STRIPE
    C -->|"Checkout / Portal"| STRIPE
    B -->|"Hosted Checkout / Portal"| STRIPE
    STRIPE -->|"Signed webhook · HTTPS"| ALB
    DB -->|"Synchronous replication"| STANDBY

    classDef client fill:#c8e6c9,stroke:#2e7d32,color:#1b3a1e,stroke-width:2px
    classDef edge fill:#bbdefb,stroke:#1565c0,color:#0d2f5c,stroke-width:2px
    classDef app fill:#1565c0,stroke:#0d47a1,color:#fff,stroke-width:2px
    classDef db fill:#b2ebf2,stroke:#00838f,color:#00363d,stroke-width:2px

    class B,M client
    class CF,S3,ALB edge
    class A,C,WORKER app
    class DB,STANDBY,REDIS db
    class IMAGES edge
    class NVIDIA,STRIPE edge

    style AWS fill:#f4f7fb,stroke:#6f8aa6,stroke-width:2px
    style VPC fill:#f4f7fb,stroke:#6f8aa6,stroke-width:2px
    style AZA fill:#eef8ec,stroke:#6ea36a,stroke-width:2px
    style AZB fill:#eef8ec,stroke:#6ea36a,stroke-width:2px
    style DATA fill:#fff5f5,stroke:#c2185b,stroke-width:2px
```

#### Deployment, private egress, and operations

```mermaid
flowchart LR
    subgraph APP["Private application tier · two AZs"]
        A["Fargate API task A"]
        B["Fargate API task B"]
        MIG["One-off migration task"]
        WORKER["Fargate Celery worker service"]
        NAT_A["NAT Gateway A"]
        NAT_B["NAT Gateway B"]
    end

    subgraph AWS["AWS managed services"]
        SM["Secrets Manager"]
        DB[("RDS PostgreSQL Multi-AZ")]
        CW["CloudWatch<br/>Logs · metrics · alarms · rollback signals"]
        BACKUP["RDS automated backups<br/>point-in-time recovery"]
        IGW["Internet Gateway"]
        SES["SES<br/>Account email"]
    end

    EXT["External APIs<br/>Stripe · NVIDIA"]

    SM -.->|"Task execution role · inject config"| A
    SM -.->|"Task execution role · inject config"| B
    SM -.->|"Inject migration config"| MIG
    SM -.->|"Inject worker config"| WORKER
    MIG -->|"Migrate before release"| DB
    A --> DB
    B --> DB
    A --> CW
    B --> CW
    MIG --> CW
    WORKER --> CW
    DB -->|"Managed recovery"| BACKUP
    A --> NAT_A --> IGW
    B --> NAT_B --> IGW
    WORKER -->|"Tasks placed in AZ-a"| NAT_A
    WORKER -->|"Tasks placed in AZ-b"| NAT_B
    IGW -->|"Outbound HTTPS"| EXT
    IGW -->|"Account email · task-role access"| SES

    classDef app fill:#1565c0,stroke:#0d47a1,color:#fff,stroke-width:2px
    classDef ops fill:#e1bee7,stroke:#6a1b9a,color:#2e0a3d,stroke-width:2px
    classDef db fill:#b2ebf2,stroke:#00838f,color:#00363d,stroke-width:2px
    classDef edge fill:#bbdefb,stroke:#1565c0,color:#0d2f5c,stroke-width:2px

    class A,B,MIG,WORKER app
    class SM,CW,SES ops
    class DB,BACKUP db
    class NAT_A,NAT_B,IGW edge
    class EXT edge

    style APP fill:#eef8ec,stroke:#6ea36a,stroke-width:2px
    style AWS fill:#f4f7fb,stroke:#6f8aa6,stroke-width:2px
```
</details>

This is a future recommendation, not deployed infrastructure or a current
provisioning plan. Two API tasks across AZs provide horizontal application
capacity and task/AZ resilience; the RDS standby provides failover, not read
scaling. Autoscaling policies and database read scaling still need design.
Redis availability, durability, and capacity, plus worker count and concurrency,
still need sizing and cost review. Celery Beat is omitted until scheduled jobs
are needed. The [canonical C4 model](reference_docs/knowledge/diagrams/longevity-architecture.dsl)
contains the full production deployment view and security boundaries.

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

