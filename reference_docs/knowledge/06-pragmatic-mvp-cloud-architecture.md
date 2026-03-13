#### Pragmatic MVP Cloud Architecture (Target)

## Use When
- Load this when we are working on the Pragmatic MVP Cloud Architecture.

## Source
- Derived from `reference_docs/knowledge/planning.md` sections 1.9.


```mermaid
graph TB
    subgraph "Internet"
        WEB["Web Users / Browsers"]
    end

    subgraph "User Device"
        SH["Samsung Health"]
        HC["Health Connect"]
        ANDROID["Android Companion App"]
    end

    subgraph "App Hosting - AWS"
        subgraph "Edge"
            GW["ALB"]
        end

        subgraph "Compute"
            APP["Django App<br/>(ECS Fargate Service)"]
            WORKER["Celery Worker<br/>(ECS Task)"]
            BEAT["Celery Beat<br/>(ECS Task)"]
        end

        subgraph "App Data"
            ELASTICACHE[("ElastiCache Redis")]
            S3["S3 Bucket<br/>(Backups, Static)"]
        end

        subgraph "Security & Config"
            SECRETS["Secrets Manager"]
            IAM["IAM Roles"]
        end

        subgraph "Ops"
            CW["CloudWatch<br/>(Logs + Metrics)"]
        end
    end

    subgraph "Managed Database"
        TSDB[("Timescale Cloud<br/>(Managed PostgreSQL + TimescaleDB)")]
    end

    subgraph "CI/CD"
        GHA["GitHub Actions"]
        ECR["ECR<br/>(Container Registry)"]
    end

    WEB --> GW --> APP
    SH --> HC --> ANDROID
    ANDROID --> GW
    APP --> TSDB
    APP --> ELASTICACHE
    APP --> SECRETS
    WORKER --> TSDB
    WORKER --> ELASTICACHE
    BEAT --> ELASTICACHE
    GHA --> ECR --> APP
    APP --> CW
```

**MVP notes**
- Samsung sync is client-initiated: Samsung Health data is read on device, then uploaded by the Android companion app.
- No Samsung cloud webhook or provider-hosted link flow is assumed in MVP.
- Celery handles ingestion normalization, deduplication, retries, and repair tasks after uploads hit Django.
