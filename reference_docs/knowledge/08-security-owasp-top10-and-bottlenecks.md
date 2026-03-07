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
| A10 SSRF | No user-supplied URLs in server-side requests, outbound calls restricted to allowlisted provider / aggregator hosts |

#### Edge Cases
- **Duplicate data from wearable sync**: Dedup by `(user_id, metric_definition_id, recorded_at, source, source_connection_id)` unique constraint. If a duplicate arrives, upsert (ignore or update). If the provider supplies a stable external event ID, store it and enforce idempotency there too.
- **Timezone hell**: All timestamps stored as UTC (`timestamptz`). User's timezone stored on profile for display only. `recorded_at` is always UTC — the frontend converts for display.
- **Metric value out of range**: Rejected at serializer level. MetricDefinition has `min_value` and `max_value` — a heart rate of 500 bpm gets a 400 error.
- **Stripe webhook replay**: Idempotency key check. Store processed Stripe event IDs in a `StripeEvent` table. If we see the same event ID twice, skip processing.
- **Token expiry during WebSocket session**: Server sends `AUTH_EXPIRED` frame. Client must close the socket, re-authenticate via REST, get a new WS ticket, and reconnect.
- **User deletes account mid-sync**: Celery task checks `user.is_active` before writing data. If user is deleted, task aborts gracefully.
- **Concurrent metric writes for same timestamp**: The unique constraint on `(user_id, metric_definition_id, recorded_at, source, source_connection_id)` prevents silent overwrites for provider-synced data. Manual duplicate submissions still need explicit product policy (allow vs reject).
- **Aggregator webhook delivery failure**: Signed webhooks should retry, and a scheduled backfill job should repair missed intervals. Server accepts out-of-order data (sorted by `recorded_at`, not arrival time).

#### Bottlenecks & Mitigations
| Bottleneck | Symptom | Mitigation |
|---|---|---|
| Dashboard analytics on millions of rows | Slow dashboard loads (> 1s) | TimescaleDB `time_bucket()` + pre-computed daily aggregates via nightly Celery task. Cache results in Redis (10 min TTL). |
| Single Postgres primary under write load | Connection pool exhaustion, write latency spikes | Read replicas for analytics queries. Only writes go to primary. Connection pooling via PgBouncer. |
| Redis as single point of failure | Cache miss storm, Celery stalls, WS drops | ElastiCache cluster with automatic failover. App degrades gracefully (skip cache, serve from DB). |
| Third-party API rate limits (aggregator / provider APIs) | Sync jobs fail in bursts | Celery retry with exponential backoff + jitter. Per-user rate limiting on resync requests. Provider-level circuit breaker. |
| WebSocket connection memory (1000+ concurrent) | OOM on app instance | Token-bucket backpressure. Max 3 connections per user. Separate WS instances from REST API at scale. |
| Large GDPR export (user with 100K+ entries) | Request timeout | Async export via Celery. Return 202 Accepted + poll endpoint. Stream results to S3, send download link via email. |