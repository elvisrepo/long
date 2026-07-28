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

Current wearable-connection access-control boundary:
- Connection collection reads and writes require JWT authentication and are scoped to `request.user`.
- Connection status reads require JWT authentication and resolve UUIDs only inside the caller-owned queryset, so another user's connection existence and sync/error state are not disclosed.
- The client may submit only the supported `health_connect` provider; direct `samsung_health` connection registration is rejected. The backend assigns ownership, activation, and initial connection state, and rejects client-supplied ownership, activation, status, sync/error, ID, and timestamp fields.
- Registration/reactivation loads `wearable_connection_limit` from the authenticated user's current subscription plan and rejects requests when active usage is at the limit.
- The canonical MVP Pro limit is one Health Connect connection and the Free limit is zero.
- Registration/reactivation locks the authenticated user row inside a database transaction before counting and writing, preventing concurrent requests from claiming the same final connection slot.
- Active duplicate-provider validation runs after that user lock, and a database unique constraint on `(user, provider)` preserves one durable provider identity across disconnect/reactivation cycles.
- Only active connection rows count toward the limit. Authenticated disconnect uses the same per-user lock, resolves only caller-owned active UUIDs, returns `404` for unowned, unknown, or inactive IDs, and marks an owned row inactive to release its slot without erasing history.
- The upload-receipt endpoint requires JWT authentication and resolves `connection_id` together with `request.user` and `is_active=True`; another user's, unknown, or inactive connection returns `404`. `upload_id` is parsed as a UUID, and the database uniqueness constraint remains the final batch-duplicate boundary. Safe duplicate-retry responses are not implemented yet.

Current subscription-integrity boundary:
- Registration creates the user and active free subscription in one transaction, so neither row is persisted alone.
- A conditional unique constraint permits at most one current subscription per user across `trialing`, `active`, `past_due`, and `incomplete`.
- Cancelled subscriptions are historical and do not conflict with a replacement current subscription.
- `GET /api/v1/subscriptions/current/` requires authentication and scopes its lookup to `request.user`.
- Its `billing_portal_available` flag reveals only whether the authenticated user has a Stripe billing mapping; it does not expose the Stripe `cus_...` identifier.
- The current-subscription endpoint is read-only. `PATCH` returns `405`, preventing clients from directly assigning themselves a paid plan or entitlement values.
- `GET /api/v1/subscriptions/plans/` is intentionally public but returns only backend-defined active plan metadata, entitlements, and active billing options; it performs no subscription mutation and excludes retired plans and prices.
- Catalog prices expose an internal UUID, currency, minor-unit amount, and interval. Stripe provider price IDs remain private so clients cannot choose or forge provider configuration directly.
- Public catalog data is informational. Paid access must still be granted only through a trusted Stripe checkout/webhook flow.
- Plan transitions serialize on the user row and require `expected_subscription_id`; a request that observed an older current subscription is rejected after acquiring the lock instead of overwriting newer state.
- Paid transitions require an active backend-owned price that belongs to the requested plan. Clients cannot turn an arbitrary amount or Stripe price ID into entitlements.
- Missing and inactive prices are rejected before cancellation. Cross-plan validation occurs when saving the replacement, and transaction rollback restores the previous subscription if that validation fails.
- Future HTTP callers should expose this stale-write rejection as `409 Conflict`. Stripe event consumers also need event-order enforcement when more event types are handled.

Current Stripe Checkout boundary:
- Checkout creation accepts only an internal active `SubscriptionPrice.id`; Stripe `provider_price_id` values remain server-side.
- Checkout requires a current local subscription row, rejects default Free-plan prices, and rejects the caller's exact current paid price.
- Checkout also rejects a different price when the current subscription already has a Stripe subscription ID. This prevents a plan-change attempt from creating a second provider subscription while Customer Portal price-change reconciliation remains unsupported.
- Each checkout request creates a local `CheckoutAttempt`; its UUID is the Stripe idempotency key for that provider create call.
- `CheckoutAttempt.expected_subscription` captures the current subscription at checkout creation time so late Stripe webhooks cannot replace a newer subscription state.
- `CheckoutAttempt.completed` means Stripe returned a Checkout Session ID, not that the user paid or that app entitlements changed.
- `CheckoutAttempt.confirmed` means a verified Stripe `checkout.session.completed` webhook reconciled the provider session and changed the user's current subscription.
- Webhook metadata alone is not trusted. A Checkout completion must match both the local `CheckoutAttempt.id` from metadata and the stored `CheckoutAttempt.provider_checkout_session_id` against Stripe's event session ID.
- Webhook plan and price metadata must resolve to a real `SubscriptionPrice` belonging to the metadata `SubscriptionPlan`; cross-plan metadata is recorded and ignored.
- Checkout reuses the authenticated user's local Stripe `BillingCustomer.provider_customer_id` when one exists; first-time Checkout sends only the user's email and waits for the verified webhook to persist Stripe's returned customer ID.
- Webhook reconciliation rejects a Stripe customer ID that conflicts with the user's existing `BillingCustomer` or is already owned by another local user. Rejected events remain in the webhook ledger but do not grant entitlements.
- Stripe subscription update and deletion events must match both the local `provider_subscription_id` and the owning user's `BillingCustomer.provider_customer_id`; a valid provider subscription ID alone is insufficient authorization to mutate local entitlement state.
- Scheduled cancellation preserves paid access until Stripe sends the terminal deletion event. Browser redirects and local wall-clock assumptions must not downgrade the user early.
- Stripe webhook processing stores each verified Stripe event ID in `StripeWebhookEvent`; duplicate deliveries return without reapplying subscription transitions.
- Failed Stripe session creation marks the local attempt `failed` and returns a generic `502` without leaking provider exception details to the client.
- Frontend success redirects are informational only. Paid entitlements must be granted from trusted Stripe webhook processing.

Current Stripe Customer Portal boundary:
- Portal Session creation requires JWT authentication and resolves the Stripe customer from the authenticated user's local `BillingCustomer`; clients cannot submit arbitrary `cus_...` identifiers.
- Frontend visibility is driven by the backend-derived `billing_portal_available` flag, but the portal endpoint still performs its own authenticated billing-customer lookup and does not trust UI visibility as authorization.
- The return URL is server-controlled through `STRIPE_CUSTOMER_PORTAL_RETURN_URL`.
- Portal Session URLs are short-lived and created on demand rather than stored.
- Provider failures return a generic `502`; Stripe exception details remain in server logs.
- Sandbox and live portal configurations are separate. Plan switching must remain disabled until `customer.subscription.updated` safely reconciles provider price changes; otherwise Stripe billing state could diverge from local entitlements.

Current Stripe credential and traffic boundary:
- Valid Stripe sandbox secret keys are local credentials, not fake test values. They must remain in ignored environment files or an approved secret manager.
- Default automated tests override local credentials with non-functional fake values so an ordinary test run cannot mutate Stripe sandbox resources.
- Stripe sandbox is for small functional integration tests, not load testing. Its limits and latency profile do not represent live payment processing.
- Load tests must replace outbound Stripe requests with a configurable fake and simulate realistic latency, `429` responses, timeouts, and retries.
- Production Stripe calls must handle rate limiting with safe retries, exponential backoff, jitter, idempotency keys, and monitoring that excludes secrets and payment data.
- See `reference_docs/knowledge/38-stripe-testing-and-load-testing.md`.

#### Edge Cases
- **Duplicate data from wearable sync**: The implemented `MetricEntry.source_connection` foreign key preserves connection provenance. PostgreSQL enforces a conditional unique constraint for non-null `(source_connection, external_source_id)` values; ingestion must update a corrected provider record rather than insert a duplicate.
- **Timezone hell**: All timestamps stored as UTC (`timestamptz`). User's timezone stored on profile for display only. `recorded_at` is always UTC — the frontend converts for display.
- **Metric value out of range**: Rejected at serializer level. MetricDefinition has `min_value` and `max_value` — a heart rate of 500 bpm gets a 400 error.
- **Stripe webhook replay**: Store processed Stripe event IDs in `StripeWebhookEvent`. If we see the same event ID twice, skip processing.
- **Stripe webhook session mismatch**: If metadata points at a real local checkout attempt but the Stripe Checkout Session ID differs from the stored `provider_checkout_session_id`, record the event and skip entitlement changes.
- **Stripe webhook price/plan mismatch**: If metadata combines a plan ID with a price ID from another plan, record the event and skip entitlement changes.
- **Stripe webhook stale subscription**: If the user's current subscription no longer matches `CheckoutAttempt.expected_subscription`, record the event and skip entitlement changes.
- **Stripe customer ownership mismatch**: If Checkout completion returns a customer different from the user's stored Stripe customer, or a customer already linked to another user, record the event and skip entitlement changes.
- **Stripe subscription lifecycle ownership mismatch**: If an update or deletion event's customer does not own the matched local provider subscription, record the event and skip all local subscription changes.
- **Scheduled Stripe cancellation**: Keep the paid local subscription active when `cancel_at_period_end=true`; downgrade only after Stripe sends `customer.subscription.deleted`.
- **Checkout retry after timeout**: Local `CheckoutAttempt.id` is sent as Stripe's idempotency key. A retry of the same attempt should reuse that ID; a later intentional checkout action should create a new attempt.
- **Token expiry during WebSocket session**: Server sends `AUTH_EXPIRED` frame. Client must close the socket, re-authenticate via REST, get a new WS ticket, and reconnect.
- **User deletes account mid-sync**: Celery task checks `user.is_active` before writing data. If user is deleted, task aborts gracefully.
- **Concurrent provider-record writes**: The conditional `(source_connection, external_source_id)` unique constraint is the final race-safe guard against inserting one provider record twice. Application-level existence checks alone remain insufficient. Manual entries have null external IDs and remain outside this constraint.
- **Concurrent custom metric entitlement writes**: Create/reactivate requests for the same user lock that user's row before counting and writing, so only one request can claim the final active custom metric slot.
- **Concurrent wearable connection writes**: Creation requests for the same user lock that user's row before counting and inserting, so only one request can claim the final wearable connection slot.
- **Android upload retry after network loss**: Upload receipts are idempotent per `(wearable_connection, upload_id)`. The first request returns `201`; a retry returns the existing caller-owned receipt with `200`, while the database unique constraint prevents a concurrent duplicate receipt. Future entry ingestion must preserve this guarantee and accept out-of-order samples by `recorded_at`, not arrival time.
- **Premature wearable-entry upload**: While the endpoint remains receipt-only, undeclared fields such as `entries` return `400`. Strict rejection prevents DRF from silently discarding health data while returning a misleading successful receipt.
- **Wearable payload abuse or schema smuggling**: The isolated future batch contract requires `1–100` entries, rejects undeclared fields at the batch and nested-entry levels, and rejects repeated external record IDs within a batch. The live endpoint remains receipt-only until hashing and persistence are implemented.
- **Future aggregator webhook delivery failure**: Signed webhooks should retry, and a scheduled backfill job should repair missed intervals when cloud-based providers are added later.

#### Bottlenecks & Mitigations
| Bottleneck | Symptom | Mitigation |
|---|---|---|
| Dashboard analytics on millions of rows | Slow dashboard loads (> 1s) | TimescaleDB `time_bucket()` + pre-computed daily aggregates via nightly Celery task. Cache results in Redis (10 min TTL). |
| Single Postgres primary under write load | Connection pool exhaustion, write latency spikes | Read replicas for analytics queries. Only writes go to primary. Connection pooling via PgBouncer. |
| Redis as single point of failure | Cache miss storm, Celery stalls, WS drops | ElastiCache cluster with automatic failover. App degrades gracefully (skip cache, serve from DB). |
| Mobile upload bursts after offline periods | Large sync batches spike worker load | Queue uploads, process them asynchronously, and cap per-connection replay windows. |
| Third-party API rate limits (aggregator / provider APIs) | Sync jobs fail in bursts | Celery retry with exponential backoff + jitter. Per-user rate limiting on resync requests. Provider-level circuit breaker. This is mainly for post-MVP cloud integrations. |
| Stripe API rate or concurrency limits | Checkout or subscription operations receive `429` or object lock timeouts | Use idempotency keys, exponential backoff with jitter, inspect Stripe's rate-limit reason, serialize mutations to the same provider object, and never load test against sandbox. |
| WebSocket connection memory (1000+ concurrent) | OOM on app instance | Token-bucket backpressure. Max 3 connections per user. Separate WS instances from REST API at scale. |
| Large GDPR export (user with 100K+ entries) | Request timeout | Async export via Celery. Return 202 Accepted + poll endpoint. Stream results to S3, send download link via email. |
