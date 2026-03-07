### 2.7 Implementation Strategy

## Use When
- Load this when you need the overall build strategy, delivery order, slice structure, or learning sequence.

## Source
- Derived from `reference_docs/knowledge/planning.md` section 2.7.

#### The 4-Architecture Progression

The plan contains 4 architectures. They're not separate systems — they're stages of the same system growing:

```
1. Local Dev           →  2. MVP Cloud          →  3. Full Requirements    →  4. Scaled (1M+)
(Docker Compose)          (Single-instance         (All features,            (Read replicas,
                           cloud deploy)            all integrations)         auto-scaling,
You code here.            R1 deploys here.         R1–R5 complete.           CDN, WAF)
Never changes.            Infra grows in place.    This is the goal.         Only if needed.
```

**Your ultimate target is #3 — Full Requirements Architecture.** #4 is for reference / interviews / if you get massive traction.

**Key insight: #2 evolves into #3 naturally.** You don't "migrate" — you add components to the same cloud infrastructure as you ship each release:
- **R1**: Django + Timescale + Redis on cloud → **architecture #2**
- **R2**: Add Stripe webhook endpoint → same infra, just new code
- **R3**: Add wearable aggregator link flow, webhook receiver, and backfill jobs → same infra, add more Celery capacity
- **R4**: Add Django Channels, add Uvicorn alongside Gunicorn → same infra, add ASGI routing
- **R5**: Add analytics endpoints → same infra, just new code
- **End result: architecture #3 — without ever "migrating"**

#### Vertical Slice Implementation

Build features end-to-end (model → serializer → view → test → deploy), not layer-by-layer.

| Horizontal (❌ don't do this) | Vertical (✅ do this) |
|---|---|
| Week 1: Build ALL models | Week 1: Build auth end-to-end |
| Week 2: Build ALL serializers | Week 2: Build metric logging end-to-end |
| Week 3: Build ALL views | Week 3: Build dashboard analytics end-to-end |
| Week 4: Try to connect everything | Each week delivers a working, tested, deployed feature |

**R1 MVP vertical slices (~3-5 days each):**

| Slice | What you build | Shippable result |
|---|---|---|
| **1. Scaffold** | Django project, Docker Compose, CI pipeline, deploy pipeline | Empty app deployed to cloud, CI runs on push |
| **2. Auth** | User model, encrypted PII, `email_lookup_hash`, register, login, refresh, logout, rate limiting | Users can create accounts and log in |
| **3. Metric definitions** | MetricDefinition model, seed data migration, list endpoint | API returns available metrics |
| **4. Metric logging** | MetricEntry model, TimescaleDB hypertable, create/list/filter endpoints | Users can log and retrieve metrics |
| **5. Analytics** | time_bucket queries, analytics endpoint, Redis caching | Users can see 7/30-day trends |
| **6. Deploy + Monitoring** | Health check, structured logging, CI/CD deploy, basic monitoring | Working MVP deployed to cloud |
| **7. Docs + Hardening** | Error handling, API docs, security headers, test coverage hardening | Production-ready MVP |

Each slice: code → test → PR → CI green → merge → deploy.

**Post-MVP hardening (R1.1):** Password reset, GDPR export/delete, and audit logging. Important, but not required to prove the core product loop.

#### Tech Learning Timeline

You don't need to learn everything before starting. Learn each tech right before the slice that needs it:

| Phase | Tech to learn | Estimated ramp-up |
|---|---|---|
| **Before Slice 1** | Docker Compose, GitHub Actions CI, Terraform basics | 1-2 days |
| **Slices 2-7 (R1)** | Django + DRF, PostgreSQL + TimescaleDB, pytest, Redis (cache), JWT auth | Core skills — should already know Django/DRF |
| **R2 (Monetization)** | Stripe API (Checkout, webhooks), Celery basics | 1-2 days |
| **R3 (Integrations)** | Aggregator link flow, webhook verification, Celery (retries, backoff, scheduling), provider normalization | 2-4 days |
| **R4 (Real-Time)** | Django Channels, WebSocket protocol, Redis Pub/Sub | 2-4 days (steepest curve) |
| **R5 (Advanced)** | Data analysis patterns (percentiles, anomaly detection), advanced caching | 1-2 days |
