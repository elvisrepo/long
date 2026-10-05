#### Security (OWASP Top 10 addressed)

## Workout tracking boundary — 2026-10-01 backend slice

Session timing (2026-10-03) reuses JWT-scoped session PATCH and the user-row lock.
Clients cannot write the running timestamp, elapsed total or server clock. Only
bounded nullable duration corrections and start/pause commands are accepted;
corrections pause timing and cannot accompany an action. Repeated actions do not
reset/double-count. Finish pauses atomically; finished sessions cannot start.
SQL constrains duration and prevents a running finished/unknown-duration state.
Copies and routine starts are untimed, and account deletion cascades timing with
sessions. These are informational wall-clock logs, not a billing clock or trusted
proof of exercise. Manual corrections remain last-write-wins. UI failures never
optimistically pause the server clock; ambiguous failures advise refreshing.

- JWT required, no paid-plan gate. Identity is derived from authentication;
  owner-scoped lookups reject foreign nested references and private history.
- Mutations (including explicit catalog initialization) lock the user row within
  a transaction, serializing with account deletion. A one-to-one initialization
  marker and scoped SQL name uniqueness protect repeat/concurrent seeding.
- GET catalog is read-only. History requires a 1–366-day date range and paginates
  sessions (default 25/max 100); optional exercise filtering verifies ownership.
- Name/search length is bounded, notes/comments capped at 2000, numeric fields
  validated by snapshot type. Partial set updates validate combined saved/input
  values; planned rows cannot claim completion with missing required quantities.
- Type/unit/name snapshots are server-written and immutable. Catalog edits cannot
  reinterpret recorded work. Archive preserves history; RESTRICT prevents direct
  deletion of referenced exercises while allowing full account cascades.
- WorkoutExercise.clean validates the cross-owner relationship for full_clean
  callers. Foreign keys alone do not enforce it; raw ORM writers must use the
  validated owner-scoped services or explicit model validation. WorkoutSet.clean
  validates type-specific fields; SQL constraints additionally protect positive
  quantities/nonnegative load, not the whole cross-table type invariant.
- Account export includes private catalogs/snapshots/sets and the seeding marker;
  user deletion cascades all six tables. No URLs are fetched from exercise notes.
- Basic frontend integration now uses owner-scoped `workouts` query keys, cleared
  with all private caches on logout. Writes require bearer authentication and
  disable duplicate submission while pending; results are server-confirmed, not
  optimistic completion. Pagination constructs same-origin API paths rather than
  trusting arbitrary provider `next` URLs. Notes/comments are rendered as text,
  not HTML. Windowed progress now derives from authenticated bounded session reads,
  never public/private cross-owner analytics. See `47-workout-tracking.md`.
- Library browsing never creates workouts; choosing an existing occurrence avoids
  a duplicate UI write. This does not replace backend ownership validation or
  introduce SQL uniqueness. Direct removal requires explicit confirmation, keeps
  errors visible in the dialog, and cannot edit finished sessions without reopening.
  The existing owner-scoped occurrence DELETE still deletes its sets permanently.

### All-time exercise summary boundary — 2026-10-02

Metric goals (2026-10-05) retain the strength goal JWT/owner-lock boundaries.
Creation checks the active catalog type; saved goal type/tracking type/units cannot
be patched. Targets have bounded precision/ranges; reps and seconds must be whole
numbers. SQL constraints protect type/shape/bounds (integer validation is at the
API boundary). Completed-set queries check workout and catalog ownership; rates
require positive paired distance/time in one set before division. No client-supplied
achievement, public sharing, body-mass assumption or cross-unit conversion.
Migration 0010 preserves legacy strength targets; metrics participate in the same
20-goal cap, export and deletion lifecycle. This is a single-set achievement, not
proof of finishing a race distance, a permanent award or a health recommendation.

Selective copying shares the existing owner lock and transaction. Selection lists
are bounded and unique; unknown fields reject, every selected occurrence belongs
to the source and every selected set belongs to its occurrence. Nested catalog
ownership is checked before cloning, even for inconsistent raw ORM links.
Validation completes before new rows exist; errors leave no partial workout.
Archived/finished source snapshots are preserved, never rewritten from current
catalog defaults. Source remains unchanged; copies reset performance state and
comments/notes. Shared UI preview/cancel is read-only; pending locks and retained
errors prevent optimistic success claims. It remains a non-idempotent create:
an ambiguous network failure may have created a copy; verify destination before
retrying when unsure. No external sharing, paid gate or schema migration.

Adjacent exercise/set move endpoints require JWT and independently scope workout
and catalog ownership. Mutations serialize on the user row with all other workout
writes/account deletion; sibling updates are atomic. Only direction up/down is
accepted. Finished sessions require reopening. Normalization updates order only,
not snapshot values, comments, completion or groups. Boundary moves do not write.
The client waits for server confirmation and refetches private owner-scoped data;
failure remains visible beside the controls and retryable. No migration or new
entitlement gate. Reordering also changes the next superset member in workout order.

Bulk set corrections require JWT, unique bounded selection (1–100) and independent
workout/catalog owner guards. The shared owner row lock serializes with individual
writes/account deletion. Every expected full set snapshot and every finished-session
guard is checked before writes; combined-value validation precedes all updates.
Stale snapshots reject `409` with no partial mutation; missing/foreign rows `404`.
Only quantity/comment/completion fields may change, never order/ownership/snapshots.
Numeric batches cannot mix frozen type/units; no implicit conversion. Unknown
outer/nested/change fields reject. Delete requires explicit UI preview and removes
only selected sets/comments. Saved history, goals and records recalculate; no paid
gate, sharing, schema migration, bulk rest-timer trigger or group advance.
Snapshots are stale-value guards, not idempotency/version tokens; a network failure
requires refresh/review rather than automatic retry. Raw ORM writes that bypass the
owner lock are not part of this serialization guarantee.

Exercise statistics and goals use authenticated owner-scoped library lookups, and completed-set queries independently check workout ownership. SQL statistics preserve frozen type/unit partitions. Goal creation/edit/deletion locks the user row, sharing account-deletion serialization. Inputs are bounded, unknown goal input fields reject, and saved goal units cannot be patched. Creation is capped at 20 goals per exercise and requires active compatible library entries; old goals remain readable/editable after library changes. Goal reads derive actual completed source sets, not estimates or permanent achievement records; editing/deleting/uncompleting a source changes the result. The 20-target response bound limits per-goal queries, not the cost of scanning a long exercise history. Goals participate in account export/cascade deletion. No public sharing or paid-plan gate.

Workout preference reads and patches are authenticated and owner-scoped, available to every account tier. Reads do not seed data; patches share the owner lock used by account deletion. Inventories are bounded (20 sizes, 0–100 plates per size, weights ≤1000), duplicate sizes rejected. Favorites and graph defaults never change historical exercise snapshots. Catalog usage hints include only that owner's completed sets; preference export/deletion follows the existing account lifecycle.

All-time progress/records are private read-only summary endpoints, not unbounded
raw session exports. Exercise ownership and workout ownership are both filtered,
including protection against inconsistent cross-owner raw ORM links.

Cardio speed/pace use those same owner-scoped queries and positive distance/time
guards before division. They expose no new private fields or writes. Frozen units
remain separate, and calculated charts never mutate source quantities/completion.

Completed-only SQL aggregates and window functions preserve frozen type/unit partitions; archived
exercises remain readable. Required date, metric/rep/unit validation and strict
1–500 pagination bounds reject malformed requests. Frontend pagination builds
same-origin paths and owner-scoped query keys; no arbitrary `next` URL is fetched.
Source navigation still uses authenticated detail routes. These queries scan the
selected exercise's history through the cutoff; bounded response pages do not
bound total database aggregation cost. No cached PR table, public analytics,
notes fetch, new index or migration is introduced.

### Routine template boundary — 2026-10-02

Routine preview/start (2026-10-03): GET preview is read-only and JWT/owner-scoped,
including nested exercise ownership and completed-history lookups. POST retains
the per-owner lock and atomic transaction, validates all selected template IDs
before creating a workout, and recomputes the plan before comparing its fingerprint.
The fingerprint is not a bearer credential; ownership checks apply independently.
Stale plans return `409` with no partial write. Carry-forward requires a preview,
never guesses ambiguous duplicates, and never copies private set comments.
The client disables confirmation during reads/writes and requires an explicit
refresh after failed creation; it does not automatically retry non-idempotent starts.
On ambiguous network failure it advises checking the destination for an already
created session before retrying. This is not an idempotency guarantee.

- All plans can use private routines with JWT; never accept client ownership or
  direct exercise/set snapshot input. Capture references must resolve to an own
  saved workout; empty sources and cross-owner nested exercise references fail.
- Capture, replacement, start, archive and day deletion serialize on the owner
  row in atomic transactions, including account deletion. Start cannot race a
  partial replacement. SQL uniqueness scopes routine/day names correctly.
- Templates have no completion/performance state. Starting generates independent
  rows, no template FK, so changing/removing templates cannot change old sessions.
  Archived catalog exercises retain frozen template types/units; archived routines
  must restore before their day mutations. RoutineExercise.clean checks owner
  relationships, RoutineSet.clean shares snapshot quantity validation with
  WorkoutSet; raw ORM writes still require explicit validation.
- Account export includes all four owner-scoped template tables, and account
  deletion cascades them. Frontend routine caches use the existing private owner
  prefix and logout clearing. Modal write errors remain visible inside the dialog;
  a confirmed routine creation is reused when a subsequent day write fails.
- Direct template editing uses owner-locked transactions and owner-scoped nested
  exercise/set lookups. Only active own catalog exercises may be added; frozen
  snapshots/reference cannot be patched. Existing archived library snapshots may
  be edited, but archived routines must restore. Planned quantity validation is
  shared with the workout validator; template sets never store completion/comments.
- Group labels are bounded text on owner-scoped occurrences, not cross-user
  references. Group mutations require an open session or active routine and serialize
  with copying/start/deletion. Export includes labels; no new table/cascade behavior.
- Session group PUT validates all member/library IDs before any writes, inside
  the same owner-locked transaction. Members must belong to that workout; library
  additions must be active/owned. UUID lists are unique and bounded to 100 each.
  Hex-only colours prevent arbitrary CSS values. Rename collisions reject rather
  than silently merge. DELETE only clears membership; logged sets remain intact.
  Missing original names reject stale edits. Finished workouts require reopening.
- Calculator output is never accepted as proof of completion or a record. Percentage
  outputs use ordinary planned-set validation; plate search validates finite inventory
  and bounds computation. Calculation drafts and running countdowns are temporary;
  explicitly saved equipment and auto-start/advance preferences persist per account.
  Timer updates/advancement fire only after server-confirmed new completion.

## Diet tracking boundary — 2026-10-01

- JWT is required; catalogs and histories are private. Food ownership follows
  `food.section.user`. Entry writes bind the authenticated user and require that
  owner; entry reads filter both owner paths. Foreign edits/check-offs return 404.
- All mutations lock the user row in a transaction, serializing with deletion;
  SQL uniqueness protects scoped names and one daily check-off per food/user.
- Name length is bounded to 120, order is nonnegative, and history ranges cap at
  366 days. Archive retains history; undo works even after archive.
- DietEntry.clean validates matching owners for explicit full_clean callers;
  ordinary foreign keys do not enforce this cross-table invariant for raw writes.
- Export is owner-scoped; deletion cascades owned sections/foods/entries. Cache
  keys include the owner and successful logout clears private query state.
- No Pro gate or nutrient/medical recommendations. See `46-diet-tracking.md`.

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

Production debug boundary:

- `DEBUG=False` prevents public Django exception pages from exposing stack
  traces, source locations, request details, database clues, and configuration
  context.
- Disabling debug does not disable observability. Production errors belong in
  redacted console logs collected by CloudWatch, with user-facing responses kept
  generic.
- Production settings must fail closed when required configuration is missing;
  they must not inherit local SQLite, localhost URL, or development-secret
  fallbacks from shared settings.

Public health-endpoint boundary:
- `GET /api/v1/health/live/` and `GET /api/v1/health/ready/` require no JWT so
  infrastructure and external monitoring can call them.
- Liveness returns only fixed process status and never queries the database.
- Readiness executes only the constant parameter-free `SELECT 1` probe through
  Django's configured default connection; it does not accept user input.
- Database failures return only `503 {"status": "unavailable"}`. Connection
  errors, credentials, hostnames, and exception text are never serialized or
  deliberately logged by the handler.
- Readiness excludes Redis and Celery because unavailable optional services
  must not fail the staging deployment database gate or remove an otherwise
  usable task from the recommended production ALB target group.
- The former unauthenticated `/tasks/ping/` endpoint has been removed. Public
  callers can no longer create arbitrary broker traffic through a diagnostic
  route; future task diagnostics must use a protected operational boundary.

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

Current metric-entry export boundary:
- `GET /api/v1/metrics/entries/export/` requires JWT authentication, accepts no
  user identifier, and always scopes the streamed queryset to `request.user`.
- The endpoint loads the current server-owned subscription plan and requires
  `csv_export_enabled=true`; Free requests receive `403`. Frontend visibility
  is presentation only and is not the authorization boundary.
- Metric and date filters narrow that owned queryset. Malformed date-time
  filters return a controlled `400` response.
- The export omits wearable connection IDs and provider-owned external record
  IDs. It contains the portable metric record fields needed by the user.
- User-controlled metric names and units beginning with spreadsheet formula
  characters are prefixed with an apostrophe to prevent CSV formula execution
  when the file is opened in common spreadsheet software.
- Streaming avoids holding the entire history in application memory. Very
  large account-wide GDPR archives may still require the planned asynchronous
  object-storage flow.

Current wearable-connection access-control boundary:
- Connection collection reads and writes require JWT authentication and are scoped to `request.user`.
- Connection status reads require JWT authentication and resolve UUIDs only inside the caller-owned queryset, so another user's connection existence and sync/error state are not disclosed.
- The client may submit only the supported `health_connect` provider; direct `samsung_health` connection registration is rejected. The backend assigns ownership, activation, and initial connection state, and rejects client-supplied ownership, activation, status, sync/error, ID, and timestamp fields.
- Registration/reactivation loads `wearable_connection_limit` from the authenticated user's current subscription plan and rejects requests when active usage is at the limit.
- The canonical MVP Free and Pro limits are one Health Connect connection. Free has `automatic_sync_enabled=false` and a 30-minute manual cadence; Pro enables automatic sync at 15 minutes. These values come from the server-owned current subscription rather than client-side plan-code inference.
- Android checks that policy both before scheduling and again inside the background runner. A downgrade therefore cancels discovered periodic work, and stale work that runs before cancellation stops before reading Health Connect.
- The manual cooldown is a product/UI control in the official client, backed by its durable successful-sync cursor and Django's `last_synced_at`; it is not currently an upload-API security rate limit. One logical sync can contain several sequential upload batches, so naive per-request throttling would reject valid later batches. Backend authentication, ownership, batch-size limits, idempotency, and record deduplication remain authoritative; abuse throttling needs a future logical-attempt boundary if required.
- Registration/reactivation locks the authenticated user row inside a database transaction before counting and writing, preventing concurrent requests from claiming the same final connection slot.
- Active duplicate-provider validation runs after that user lock, and a database unique constraint on `(user, provider)` preserves one durable provider identity across disconnect/reactivation cycles.
- Only active connection rows count toward the limit. Authenticated disconnect uses the same per-user lock, resolves only caller-owned active UUIDs, returns `404` for unowned, unknown, or inactive IDs, and marks an owned row inactive to release its slot without erasing history.
- The upload-receipt endpoint requires JWT authentication and resolves `connection_id` together with `request.user` and `is_active=True`; another user's, unknown, or inactive connection returns `404`. `upload_id` is parsed as a UUID, and the database uniqueness constraint remains the final batch-duplicate boundary. A safe retry returns the unchanged caller-owned receipt without creating another `SyncRun`.
- The normalized-ingestion endpoint permanently binds `(connection, upload_id)` to its server-computed payload hash while holding the connection lock. Exact retries return the original run with `200`; changed content and legacy blank-hash receipts return `409` before any metric or connection-state write.

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
- **Duplicate and evolving data from wearable sync**: The implemented `MetricEntry.source_connection` foreign key preserves connection provenance. PostgreSQL enforces a conditional unique constraint for non-null `(source_connection, external_source_id)` values. The isolated ingestion service preloads existing records under the connection lock and counts an identical record as skipped instead of attempting another insert; the database constraint remains the final race-safe guard. Health Connect's provider modification timestamp permits a changed record to replace its older stored version, including one timestamped upgrade of a legacy row whose provider version is null. Stale, equal-version, unversioned, or inconsistent changed content raises `WearableRecordConflictError`, preserves the stored health record, and rolls back the conflicting receipt.
- **Provider history changed through manual CRUD**: Only genuinely manual `MetricEntry` rows are editable through the generic metric-entry endpoint. Provider/import-owned rows return `409` for `PATCH` and `DELETE`, and the frontend withholds those actions. This prevents a local edit from conflicting with the provider's stable external record identity and prevents a deleted provider record from being imported again on the next sync.
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
- **Paid analytics authorization**: The Weight × Steps, Sleep Insights, and
  Consistency & Coverage
  endpoints check the authenticated user's current server-owned subscription
  plan before querying entries. Hiding frontend links is only presentation;
  Free users receive `403`, and every analytics query remains scoped to
  `request.user`. Weight and Sleep use system-owned default metrics;
  Consistency additionally includes the caller's active custom metrics.
- **Consistency analytics ownership**: The consistency query includes only
  active system definitions plus active custom definitions owned by
  `request.user`; entry reads are independently scoped to that user and reject
  future timestamps. The endpoint does not accept a user identifier.
- **Sleep-target ownership and validation**: The authenticated preference
  endpoint reads and updates only `request.user`; it accepts no user ID and
  validates `target_minutes` as an integer from `60` through `1439` before
  writing. A query-string analytics target is a non-persisting preview.
- **Android upload retry after network loss**: Upload receipts are idempotent per `(wearable_connection, upload_id)`. The first request returns `201`; a retry returns the existing caller-owned receipt with `200`, while the database unique constraint prevents a concurrent duplicate receipt. Future entry ingestion must preserve this guarantee and accept out-of-order samples by `recorded_at`, not arrival time.
- **Wearable payload abuse or schema smuggling**: The live batch contract requires `1–100` entries, rejects undeclared fields at the batch and nested-entry levels, rejects non-finite numeric values, and rejects repeated external record IDs within a batch.
- **Wearable upload identity reused for different content**: The server, rather than the Android client, computes a versioned canonical SHA-256 payload fingerprint after validation. Entry order and equivalent timezone representations do not change the fingerprint; changed, added, or removed entries do. Conflicting reuse returns `409` without repeating writes.
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
# Recovery tracking boundary — 2026-09-30

- Recovery routes require JWT and expose only shared tools plus the requesting
  user's tools and entries. Writes to another user's tools return 404.
- Pro custom-tool creation is checked against the current server-side plan.
  Shared tools and research scores cannot be modified through these endpoints.
- Names/descriptions have bounded lengths; entry ranges are limited to 366 days.
- Mutations lock the user row to serialize with subscription changes/deletion;
  `(user, tool, performed_on)` is unique. PUT/DELETE are retry-safe.
- Archived history and downgrade data are retained. Export includes owned
  recovery data; account deletion cascades it without deleting shared defaults.
- Recovery query keys include the owner. Successful logout cancels outstanding
  requests and clears all query caches, including metric/subscription state.
