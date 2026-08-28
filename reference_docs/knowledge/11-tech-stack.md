###  Tech Stack

## Use When
- Load this when you need to check the tech stack we want to use .

## Source
- Derived from `reference_docs/knowledge/planning.md` sections 1.13.

| Layer | Choice | Why |
|---|---|---|
| **Backend** | Python / Django + DRF | Know it well, batteries-included, great ORM |
| **Database** | PostgreSQL 16; TimescaleDB extension in presentation staging; RDS PostgreSQL Multi-AZ recommended for production | Keep the implemented PostgreSQL contract; self-host TimescaleDB cheaply for staging, but prefer managed recovery boundaries for real production users |
| **Cache / Broker** | Redis (deferred) | Add only when measured asynchronous or cache workloads justify it |
| **Task Queue** | Celery + Celery Beat (deferred) | Mature Django option for future server-side jobs; not part of current staging or baseline production |
| **WebSockets** | Django Channels | Stays in Django ecosystem, ASGI support |
| **Web Frontend** | React + Vite + TypeScript | Fast SPA development, strong ecosystem, good fit for a separate Django backend |
| **Web Routing** | TanStack Router | Type-safe route/layout foundation with strong integration patterns for modern React apps |
| **Web Server State** | TanStack Query | Caching, retries, invalidation, and API-driven UI state for the Django backend |
| **Web Validation** | Zod | Type-safe schema validation for forms and frontend input contracts |
| **Web UI Primitives** | shadcn/ui | Editable component primitives instead of a black-box component package |
| **Web Styling** | Tailwind CSS | Works naturally with shadcn/ui and speeds app-shell styling |
| **Web Lint/Format** | ESLint + Prettier | Separate correctness checks from formatting, matches React guidance |
| **Mobile** | Kotlin Android app + Jetpack Compose + OkHttp + AndroidX WorkManager | Required for Samsung-sync MVP because Samsung data is read on device; OkHttp provides the explicit coroutine-aware HTTP boundary, while WorkManager 2.11.2 provides the stable background-work runtime and test infrastructure |
| **On-Device Health Access** | Health Connect (preferred) / Samsung Health Data SDK if required | Health Connect reduces Samsung-specific coupling; direct Samsung SDK is a fallback for metrics not exposed through Health Connect |
| **Payments** | Stripe | Best docs, Checkout + Customer Portal = minimal frontend work |
| **Auth** | djangorestframework-simplejwt | JWT, stays in DRF ecosystem |
| **Containerization** | Docker + Docker Compose | Local dev parity, easy cloud deployment |
| **CI/CD** | GitHub Actions | Free for public repos, simple YAML config |
| **IaC** | Terraform | Cloud-agnostic, version-controlled infrastructure |
| **Cloud** | Current staging: AWS CloudFront, S3, one EC2/Nginx host, EBS, Secrets Manager, Systems Manager, CloudWatch; recommended production: ALB, ECS Fargate, RDS Multi-AZ | Keep presentation staging cost-bounded while documenting a separate resilient production target |
| **Monitoring** | CloudWatch (MVP) → Prometheus + Grafana (later) | Start simple, upgrade when needed |
| **Error Tracking** | Sentry | Free tier, Django integration, best-in-class |
