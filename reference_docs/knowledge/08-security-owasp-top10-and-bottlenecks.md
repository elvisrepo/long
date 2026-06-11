#### Security (OWASP Top 10 addressed)

## Use When
- Load this when you need to work on security prevention and Bottlenecks & Mitigations .

## Source
- Derived from `reference_docs/knowledge/planning.md` sections 1.10.


| OWASP Risk | Mitigation |
|---|---|
| A01 Broken Access Control | User-scoped querysets / service methods plus permission classes per view |
| A02 Cryptographic Failures | Argon2 passwords, field-level encryption for PII, TLS 1.3, no secrets in code |
| A03 Injection | Django ORM (parameterized queries), strict serializer validation |
| A04 Insecure Design | Threat modeling in this plan, rate limiting, audit logging |
| A05 Security Misconfiguration | CSP/HSTS/CORS headers, `DEBUG=False` in prod, secrets in Secrets Manager |
| A06 Vulnerable Components | Dependabot alerts, `pip-audit` in CI |
| A07 Auth Failures | JWT with short TTL (15 min), rate-limited login (5/min), refresh token rotation |
| A08 Data Integrity Failures | Stripe webhook signature verification, input validation with range checks |
| A09 Logging Failures | `django-auditlog` on all models, structured logging, CloudWatch |
| A10 SSRF | No user-supplied URLs in server-side requests, outbound calls restricted to allowlisted provider / aggregator hosts when cloud integrations are added |

Current E2E security boundary:
- `/api/testing/reset/` is a destructive test-only endpoint.
- It is mounted only when `ENABLE_E2E_TESTING_API=True`, which is set by `config.settings.e2e`.
- `config.settings.dev` and `config.settings.prod` must not enable that flag.
- Playwright reaches the endpoint through the E2E Vite proxy against the dedicated `web-e2e` runtime, not the normal development backend.

Current metric-usage access-control boundary:
- `GET /api/v1/metrics/usage/` requires authentication.
- Usage is calculated from metric definitions filtered by `request.user`, `is_default=False`, and `is_active=True`.
- The reported and enforced limit is loaded from the authenticated user's single current subscription and associated plan.
- The client cannot submit a user identifier, so it cannot request another user's entitlement usage.
- The backend remains authoritative for both reported usage and create/reactivate enforcement; the frontend indicator is not a security control.
- Entitlement-changing create and reactivation writes use `transaction.atomic()` plus `SELECT ... FOR UPDATE` on the authenticated user's row. This serializes competing writes for one account and closes the count-then-write race.
- The lock is scoped per user, so one user's custom metric write does not serialize unrelated users' writes.

Current subscription-integrity boundary:
- Registration creates the user and active free subscription in one transaction, so neither row is persisted alone.
- A conditional unique constraint permits at most one current subscription per user across `trialing`, `active`, `past_due`, and `incomplete`.
- Cancelled subscriptions are historical and do not conflict with a replacement current subscription.
- `GET /api/v1/subscriptions/current/` requires authentication and scopes its lookup to `request.user`.
- The current-subscription endpoint is read-only. `PATCH` returns `405`, preventing clients from directly assigning themselves a paid plan or entitlement values.
- `GET /api/v1/subscriptions/plans/` is intentionally public but returns only backend-defined active plan metadata and entitlements; it performs no subscription mutation and excludes retired plans.
- Public catalog data is informational. Paid access must still be granted only through a trusted Stripe checkout/webhook flow.
- Plan transitions serialize on the user row and require `expected_subscription_id`; a request that observed an older current subscription is rejected after acquiring the lock instead of overwriting newer state.
- Future HTTP callers should expose this stale-write rejection as `409 Conflict`. Stripe event consumers also need idempotency and event-order enforcement.

#### Edge Cases
- **Duplicate data from wearable sync**: Dedup by `(user_id, metric_definition_id, recorded_at, source, source_connection_id)` plus an optional `external_source_id`. If the same Samsung-originated record is uploaded twice, ignore or update it idempotently.
- **Timezone hell**: All timestamps stored as UTC (`timestamptz`). User's timezone stored on profile for display only. `recorded_at` is always UTC — the frontend converts for display.
- **Metric value out of range**: Rejected at serializer level. MetricDefinition has `min_value` and `max_value` — a heart rate of 500 bpm gets a 400 error.
- **Stripe webhook replay**: Idempotency key check. Store processed Stripe event IDs in a `StripeEvent` table. If we see the same event ID twice, skip processing.
- **Token expiry during WebSocket session**: Server sends `AUTH_EXPIRED` frame. Client must close the socket, re-authenticate via REST, get a new WS ticket, and reconnect.
- **User deletes account mid-sync**: Celery task checks `user.is_active` before writing data. If user is deleted, task aborts gracefully.
- **Concurrent metric writes for same timestamp**: The unique constraint on `(user_id, metric_definition_id, recorded_at, source, source_connection_id)` prevents silent overwrites for provider-synced data. Manual duplicate submissions still need explicit product policy (allow vs reject).
- **Concurrent custom metric entitlement writes**: Create/reactivate requests for the same user lock that user's row before counting and writing, so only one request can claim the final active custom metric slot.
- **Android upload retry after network loss**: Uploads must be idempotent via `upload_id`. The client retries safely, and the server accepts out-of-order data (sorted by `recorded_at`, not arrival time).
- **Future aggregator webhook delivery failure**: Signed webhooks should retry, and a scheduled backfill job should repair missed intervals when cloud-based providers are added later.

#### Bottlenecks & Mitigations
| Bottleneck | Symptom | Mitigation |
|---|---|---|
| Dashboard analytics on millions of rows | Slow dashboard loads (> 1s) | TimescaleDB `time_bucket()` + pre-computed daily aggregates via nightly Celery task. Cache results in Redis (10 min TTL). |
| Single Postgres primary under write load | Connection pool exhaustion, write latency spikes | Read replicas for analytics queries. Only writes go to primary. Connection pooling via PgBouncer. |
| Redis as single point of failure | Cache miss storm, Celery stalls, WS drops | ElastiCache cluster with automatic failover. App degrades gracefully (skip cache, serve from DB). |
| Mobile upload bursts after offline periods | Large sync batches spike worker load | Queue uploads, process them asynchronously, and cap per-connection replay windows. |
| Third-party API rate limits (aggregator / provider APIs) | Sync jobs fail in bursts | Celery retry with exponential backoff + jitter. Per-user rate limiting on resync requests. Provider-level circuit breaker. This is mainly for post-MVP cloud integrations. |
| WebSocket connection memory (1000+ concurrent) | OOM on app instance | Token-bucket backpressure. Max 3 connections per user. Separate WS instances from REST API at scale. |
| Large GDPR export (user with 100K+ entries) | Request timeout | Async export via Celery. Return 202 Accepted + poll endpoint. Stream results to S3, send download link via email. |
