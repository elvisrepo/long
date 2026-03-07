#### Pragmatic MVP Cloud Architecture (Target)

## Use When
- Load this when we are working on the Pragmatic MVP Cloud Architecture.

## Source
- Derived from `reference_docs/knowledge/planning.md` sections 1.9.


```mermaid
graph TB
    subgraph "Internet"
        USER["Users / Browsers"]
    end

    subgraph "App Hosting - AWS"
        subgraph "Edge"
            GW["ALB"]
        end

        subgraph "Compute"
            APP["Django App<br/>(ECS Fargate Service)"]
            WORKER["Celery Worker<br/>(ECS Task)"]
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

    USER --> GW --> APP
    APP --> TSDB
    APP --> ELASTICACHE
    APP --> SECRETS
    WORKER --> TSDB
    WORKER --> ELASTICACHE
    GHA --> ECR --> APP
    APP --> CW
```