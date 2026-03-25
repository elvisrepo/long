## 10. C4 Deployment Diagram

## Use When
- Load this when you need the runtime placement view for the pragmatic MVP cloud target: where the main containers run, which managed services they depend on, and how the deployed runtime is arranged.

## Source
- Derived from `reference_docs/knowledge/06-pragmatic-mvp-cloud-architecture.md` and the Structurizr DSL source of truth.

### Source of Truth

The deployment model is maintained in Structurizr DSL:

- [longevity-architecture.dsl](/home/sevi/longevity/reference_docs/knowledge/diagrams/longevity-architecture.dsl)

### Scope

This deployment view covers the pragmatic MVP cloud runtime.

It includes:
- browser and Android client placement
- ALB
- Django API on ECS Fargate
- Celery worker and beat placement
- Redis
- Timescale Cloud
- Secrets Manager
- CloudWatch
- S3

It intentionally does not include:
- GitHub Actions
- ECR
- broader CI/CD pipeline mechanics

Why:
- a C4 deployment diagram is about runtime deployment topology
- CI/CD belongs in delivery architecture, not runtime deployment structure

### Current Deployment Modeling Rule

Use the deployment view for:
- where software runs
- what infrastructure or managed services it depends on
- how runtime nodes are arranged

Do not overload it with:
- implementation module details
- request-by-request flow behavior
- CI/CD delivery steps
