# Longevity

Longevity is a health and wellness tracking app with a React web client, Django
REST API, and Android companion app. It brings together personal metrics,
workouts, diet, recovery, subscription settings, and Health Connect sync.

## Product preview

Screenshots captured from the live staging app using its demo account. The
visible health and workout values are demo data.

<p><a href="https://staging.syncvitals.space">Open the staging app</a> (sign-in required).</p>

<table>
  <tr>
    <td width="50%" align="center">
      <a href="docs/screenshots/readme/dashboard.jpg"><img src="docs/screenshots/readme/dashboard.jpg" alt="Longevity dashboard with metric summaries, trends, recovery and diet checklists, and workout activity" width="100%"></a><br>
      <strong>Dashboard</strong> — a snapshot of daily health and training.
    </td>
    <td width="50%" align="center">
      <a href="docs/screenshots/readme/body-weight.jpg"><img src="docs/screenshots/readme/body-weight.jpg" alt="Body Weight metric history with a trend chart and recent entries" width="100%"></a><br>
      <strong>Metric history</strong> — review recorded values and trends.
    </td>
  </tr>
  <tr>
    <td width="50%" align="center">
      <a href="docs/screenshots/readme/workouts.jpg"><img src="docs/screenshots/readme/workouts.jpg" alt="Workout log showing completed exercises, sets, and recent training activity" width="100%"></a><br>
      <strong>Workouts</strong> — log sets and review recent sessions.
    </td>
    <td width="50%" align="center">
      <a href="docs/screenshots/readme/workout-progress.jpg"><img src="docs/screenshots/readme/workout-progress.jpg" alt="Deadlift progress view with a maximum logged weight chart and completed set records" width="100%"></a><br>
      <strong>Workout progress</strong> — follow exercise-specific performance.
    </td>
  </tr>
</table>

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

#### Request and data path

```mermaid
flowchart LR
    B["Browser"]

    subgraph AWS["AWS"]
        CF["CloudFront<br/>Route 53 alias · ACM viewer TLS"]
        FRONT["Private S3<br/>Frontend"]

        subgraph VPC["Default VPC · 172.31.0.0/16"]
            subgraph EC2["EC2 · eu-central-1c · t4g.small ARM64<br/>One host / one failure domain"]
                NG["Host Nginx<br/>Origin TLS · CloudFront-only inbound"]
                subgraph DOCKER["Docker Compose"]
                    API["Django + Gunicorn<br/>host loopback :18000 → container :8000"]
                    DB[("PostgreSQL 16<br/>no host port")]
                end
            end
            EBS["Encrypted EBS<br/>Root + retained PostgreSQL data"]
        end
    end

    B -->|"HTTPS"| CF
    CF -->|"Frontend"| FRONT
    CF -->|"/api/* · HTTPS origin"| NG
    NG -->|"127.0.0.1:18000"| API
    API -->|"Compose network"| DB
    DB -->|"Persistent data"| EBS

    classDef client fill:#c8e6c9,stroke:#2e7d32,color:#1b3a1e,stroke-width:2px
    classDef edge fill:#bbdefb,stroke:#1565c0,color:#0d2f5c,stroke-width:2px
    classDef app fill:#1565c0,stroke:#0d47a1,color:#fff,stroke-width:2px
    classDef db fill:#b2ebf2,stroke:#00838f,color:#00363d,stroke-width:2px
    classDef storage fill:#f8bbd0,stroke:#c2185b,color:#4a0f26,stroke-width:2px

    class B client
    class CF,FRONT edge
    class NG,API app
    class DB db
    class EBS storage

    style AWS fill:#f4f7fb,stroke:#6f8aa6,stroke-width:2px
    style VPC fill:#f4f7fb,stroke:#6f8aa6,stroke-width:2px
    style EC2 fill:#eef8ec,stroke:#6ea36a,stroke-width:2px
    style DOCKER fill:#edf2ff,stroke:#6980c7,stroke-width:2px
```

#### Host operations and supporting services

```mermaid
flowchart LR
    subgraph HOST["EC2 host · instance role"]
        DEPLOY["Deployment loader"]
        CERT["Certbot · systemd timer"]
        NG["Host Nginx"]
        BACKUP["Daily backup / monthly restore jobs"]
        MON["CloudWatch Agent"]
        subgraph DOCKER["Docker Compose"]
            API["Django + Gunicorn"]
            DB[("PostgreSQL")]
        end
    end

    subgraph AWS["AWS services"]
        SM["Secrets Manager"]
        ECR["ECR"]
        DNS["Route 53"]
        S3["Private S3<br/>PostgreSQL backups"]
        CW["CloudWatch<br/>Host / backup / restore metrics + alarms"]
        SNS["SNS"]
        EMAIL["Operator email"]
        SES["SES"]
    end

    DEPLOY -->|"Fetch AWSCURRENT"| SM
    DEPLOY -->|"Pull image"| ECR
    CERT -->|"DNS-01 challenge"| DNS
    CERT -.->|"Renew / reload"| NG
    BACKUP -->|"docker exec / pg_dump"| DB
    BACKUP -->|"Upload / restore read"| S3
    MON -->|"Host metrics"| CW
    BACKUP -->|"Backup / restore metrics"| CW
    CW --> SNS --> EMAIL
    API -->|"Email · instance role"| SES

    classDef ops fill:#e1bee7,stroke:#6a1b9a,color:#2e0a3d,stroke-width:2px
    classDef db fill:#b2ebf2,stroke:#00838f,color:#00363d,stroke-width:2px
    classDef email fill:#ffe0b2,stroke:#e65100,color:#4a2400,stroke-width:2px
    classDef edge fill:#bbdefb,stroke:#1565c0,color:#0d2f5c,stroke-width:2px

    class DEPLOY,CERT,NG,BACKUP,MON,SM,ECR,DNS,CW,SNS ops
    class API app
    class DB db
    class EMAIL,SES email
    class S3 edge

    style HOST fill:#eef8ec,stroke:#6ea36a,stroke-width:2px
    style DOCKER fill:#edf2ff,stroke:#6980c7,stroke-width:2px
    style AWS fill:#f4f7fb,stroke:#6f8aa6,stroke-width:2px
```
</details>

This environment is for presentation and test data. CloudFront and backups do
not remove the EC2 host as a single point of failure. The diagrams summarize
the verified V018 snapshot; see the
[`V018 current AWS diagram`](reference_docs/knowledge/diagrams/current_aws/v018-automated-backup-restore-monitoring.dsl)
for the complete deployment details and change history.

### Future recommended production

<details>
<summary>Show future recommended production architecture</summary>

#### Request path and horizontal application capacity

```mermaid
flowchart LR
    B["Browser"]
    M["Android app"]

    subgraph AWS["AWS"]
        CF["CloudFront + AWS WAF"]
        S3["Private S3<br/>React frontend"]

        subgraph VPC["Production VPC · two Availability Zones"]
            ALB["Public ALB · spans AZs<br/>HTTPS · health-based routing"]

            subgraph AZA["Private app subnet · AZ-a"]
                A["ECS Fargate task A<br/>Django + Gunicorn"]
            end
            subgraph AZB["Private app subnet · AZ-b"]
                C["ECS Fargate task B<br/>Django + Gunicorn"]
            end

            subgraph DATA["Private database subnets"]
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
    DB -->|"Synchronous replication"| STANDBY

    classDef client fill:#c8e6c9,stroke:#2e7d32,color:#1b3a1e,stroke-width:2px
    classDef edge fill:#bbdefb,stroke:#1565c0,color:#0d2f5c,stroke-width:2px
    classDef app fill:#1565c0,stroke:#0d47a1,color:#fff,stroke-width:2px
    classDef db fill:#b2ebf2,stroke:#00838f,color:#00363d,stroke-width:2px

    class B,M client
    class CF,S3,ALB edge
    class A,C app
    class DB,STANDBY db

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
        NAT_A["NAT Gateway A"]
        NAT_B["NAT Gateway B"]
    end

    subgraph AWS["AWS managed services"]
        SM["Secrets Manager"]
        DB[("RDS PostgreSQL Multi-AZ")]
        CW["CloudWatch<br/>Logs · metrics · alarms · rollback signals"]
        BACKUP["RDS automated backups<br/>point-in-time recovery"]
        IGW["Internet Gateway"]
    end

    EXT["External APIs<br/>e.g. Stripe / SES"]

    SM -.->|"Task execution role · inject config"| A
    SM -.->|"Task execution role · inject config"| B
    SM -.->|"Inject migration config"| MIG
    MIG -->|"Run migrations before release"| DB
    A -->|"Application data"| DB
    B -->|"Application data"| DB
    A -->|"Logs / metrics"| CW
    B -->|"Logs / metrics"| CW
    MIG -->|"Migration result"| CW
    DB -->|"Managed recovery"| BACKUP
    A --> NAT_A --> IGW
    B --> NAT_B --> IGW
    IGW -->|"Outbound HTTPS"| EXT

    classDef app fill:#1565c0,stroke:#0d47a1,color:#fff,stroke-width:2px
    classDef ops fill:#e1bee7,stroke:#6a1b9a,color:#2e0a3d,stroke-width:2px
    classDef db fill:#b2ebf2,stroke:#00838f,color:#00363d,stroke-width:2px
    classDef edge fill:#bbdefb,stroke:#1565c0,color:#0d2f5c,stroke-width:2px

    class A,B,MIG app
    class SM,CW ops
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
The canonical C4 model contains the full production deployment view and
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
