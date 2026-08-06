###  Tech Stack

## Use When
- Load this when you need to check the tech stack we want to use .

## Source
- Derived from `reference_docs/knowledge/planning.md` sections 1.13.

| Layer | Choice | Why |
|---|---|---|
| **Backend** | Python / Django + DRF | Know it well, batteries-included, great ORM |
| **Database** | Timescale Cloud (PostgreSQL + TimescaleDB) | Keeps TimescaleDB features without relying on unsupported RDS extensions |
| **Cache / Broker** | Redis | Cache + Celery broker + Channels pub/sub in one |
| **Task Queue** | Celery + Celery Beat | Mature, Django-native, handles scheduled + async tasks |
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
| **Cloud** | AWS (ECS Fargate, ElastiCache, S3) + Timescale Cloud | Pragmatic split: AWS for app hosting, managed Timescale for time-series DB |
| **Monitoring** | CloudWatch (MVP) → Prometheus + Grafana (later) | Start simple, upgrade when needed |
| **Error Tracking** | Sentry | Free tier, Django integration, best-in-class |
