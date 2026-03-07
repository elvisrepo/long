## 10. Post-Launch

## Use When
- Load this when you need post-launch feedback loops, performance follow-up, roadmap gates, or late-stage scaling policy.

## Source
- Derived from `reference_docs/knowledge/planning.md` section 10.

### 10.1 User Feedback
- In-app feedback widget (simple form → stored in DB or shipped to email)
- Discord / community channel for beta users

### 10.2 Performance Monitoring
- Sentry performance (transaction tracing, slow query detection)
- CloudWatch dashboards for infrastructure metrics

### 10.3 Iterate
- Fix bugs as P0 (same day), P1 (within sprint), P2 (backlog)
- Feature requests → backlog → prioritize by user demand

### 10.4 Feature Roadmap
Follow the progressive rollout (R1→R5) with gates between releases:

| Release | Gate to move forward |
|---|---|
| **R1 → R2** | p95 < 300ms, no P0/P1 security findings, 5+ beta users actively logging for 2+ weeks |
| **R2 → R3** | Stripe webhook reliability > 99.9%, entitlement tests green |
| **R3 → R4** | Sync correctness validated, provider kill-switch tested |
| **R4 → R5** | WS stability under load test, fallback-to-polling verified |

### 10.5 Scale When Needed
- Vertical first (bigger Timescale plan, bigger ECS task size)
- Then: read replicas, CDN, Celery worker auto-scaling
- Kubernetes only if you have a team and need multi-region
