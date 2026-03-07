## 4. Backend Development

## Use When
- Load this when you need the backend release roadmap, release-by-release scope, or the ordered backlog from R1 through R5.

## Source
- Derived from `reference_docs/knowledge/planning.md` section 4.

Follows the progressive rollout (R1→R5):

### R1 — Foundation (Weeks 1-6, MVP)
1. Django project scaffold with split settings (base/dev/prod/test)
2. Custom User model with encrypted PII fields + `email_lookup_hash`
3. JWT auth (register, login, refresh, logout)
4. Basic rate limiting on auth endpoints
5. Security middleware (CORS, CSP, HSTS headers)
6. MetricDefinition model + default seed data migration
7. MetricEntry model + TimescaleDB hypertable
8. Metrics CRUD API with user scoping
9. Basic analytics endpoint (time_bucket queries)
10. API docs via `drf-spectacular`
11. Health endpoint, structured logging, deploy pipeline

### R1.1 — Compliance Hardening (Weeks 7-8)
12. Password reset
13. GDPR endpoints (export, deletion)
14. Audit logging

### R2 — Monetization (Weeks 9-10)
15. Stripe Checkout + Customer Portal integration
16. Subscription model + webhook handler (signature verification, idempotent processing)
17. Tier-based permission enforcement
18. Retention policy Celery task

### R3 — Wearable Integrations (Weeks 11-13)
19. Wearable aggregator hosted link flow
20. Signed webhook receiver + idempotent processing
21. Periodic backfill Celery task with dedup
22. Data reconciliation (timestamp + source_connection unique constraint)

### R4 — Real-Time (Weeks 14-15)
23. Django Channels ASGI setup
24. WebSocket consumer with ticket-based auth
25. Token-bucket backpressure
26. Live dashboard push

### R5 — Advanced (Weeks 16-18)
27. Advanced analytics (percentiles, anomaly detection)
28. Full caching layer
29. Custom metric definitions for premium users
30. Premium API access tier
