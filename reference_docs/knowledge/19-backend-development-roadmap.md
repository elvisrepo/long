## 4. Backend Development

## Use When
- Load this when you need the backend release roadmap, release-by-release scope, or the ordered backlog from R1 through R5.

## Source
- Derived from `reference_docs/knowledge/planning.md` section 4.

Follows the progressive rollout (R1→R5):

### R1 — Foundation (Weeks 1-6, Manual-Entry Release)
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

Current checkpoint note:
- the R1 auth foundation is complete enough to move into metrics work
- MetricDefinition model, default seed data migration, and authenticated list endpoint are implemented
- MetricEntry model and the first authenticated manual create endpoint are implemented
- manual metric entry creation currently covers the happy path for active default metric definitions; validation and read/query coverage should continue through TDD
- deferred user-backend scope still includes password reset, profile/account lifecycle work, and any optional email-verification flow

### R2 — Samsung Validation Spike (Weeks 9-10)
15. Expand `WearableConnection` model for device-bridge sync state
16. Authenticated wearable upload endpoint with `upload_id` idempotency
17. Dedup + normalization service with sync cursor handling
18. Internal Android companion prototype proves `Samsung Health -> app -> backend`

### R3 — Samsung Sync MVP (Weeks 11-13)
19. User-facing connection/list/status endpoints for Samsung sync
20. Replay / resync request flow and connection disconnect handling
21. Background ingestion, reconciliation, and repair Celery tasks
22. Sync error surfacing, retries, and connection health reporting

### R4 — Monetization (Weeks 14-15)
23. Stripe Checkout + Customer Portal integration
24. Subscription model + webhook handler (signature verification, idempotent processing)
25. Tier-based permission enforcement
26. Retention policy Celery task

### R5 — Real-Time + Advanced (Weeks 16-18)
27. Django Channels ASGI setup
28. WebSocket consumer with ticket-based auth
29. Advanced analytics, richer caching, and premium custom metrics
30. Premium API access tier + live dashboard push
