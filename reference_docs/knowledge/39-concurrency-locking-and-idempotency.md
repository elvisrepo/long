# Concurrency, Locking, And Stripe Idempotency

## Use When

- You need to reason about race conditions, row locks, optimistic stale checks, or external provider idempotency.
- You are changing metric-definition entitlement writes, subscription plan transitions, or Stripe Checkout creation.
- You need to decide whether a problem should be solved with database locking, optimistic locking, idempotency keys, or a combination.

## Core Terms

Race condition:
- Two or more operations overlap in time.
- The final result depends on timing rather than a deliberate rule.
- Example: two requests both read account balance `100`, both add `10`, both save `110`; the correct result should have been `120`.

Pessimistic locking:
- Lock the database row before changing or validating state.
- Other transactions that need the same lock must wait.
- Useful when conflicts are likely or the invariant must be protected while reading and writing.

Optimistic locking:
- Do not block first.
- Proceed only if the state is still the state the caller observed.
- Usually implemented with a `version` column or an expected row identifier.
- Useful when conflicts are less common and stale writes should be rejected.

Idempotency:
- Repeating the same logical operation should not perform the side effect twice.
- For Stripe, the idempotency key tells Stripe that a repeated `POST` is a retry of the same operation.
- This protects external provider side effects, not just our database rows.

## Where We Use Pessimistic Locking

### Custom metric active-limit writes

File: `backend/apps/metrics/serializers.py`

Custom metric creation and reactivation use:

```python
locked_user = (
    get_user_model()
    .objects.select_for_update()
    .get(pk=request.user.pk)
)
```

This runs inside `transaction.atomic()`.

What it does:
- PostgreSQL locks the authenticated user's row.
- A second transaction trying to lock the same user row waits.
- After the first transaction commits or rolls back, the second transaction continues.

Why:
- The active custom metric limit is a count-then-write invariant.
- Without locking, two requests can both count `2` active custom metrics and both create/reactivate one more, ending with `4` when the limit is `3`.

### Subscription transitions

File: `backend/apps/subscriptions/services.py`

Plan transitions use:

```python
get_user_model().objects.select_for_update().get(pk=user.pk)
```

This is a PostgreSQL row-level lock on the user's row, held until the surrounding transaction finishes.

What it protects:
- Two plan changes for the same user cannot cancel and replace subscription rows at the same time.
- Different users can still change plans concurrently because they lock different user rows.

## Is This The Lock?

Yes:

```python
get_user_model().objects.select_for_update().get(pk=user.pk)
```

The `select_for_update()` part asks PostgreSQL to take a row-level lock on the selected row.

The `.get(pk=user.pk)` part chooses the specific row to lock.

This must run inside a transaction. In our transition service, that is provided by:

```python
@transaction.atomic
```

or, in tests, by an outer `transaction.atomic()` around the operation.

## Is This Optimistic Locking?

This line is not optimistic locking by itself:

```python
current_subscription = Subscription.objects.get(
    user=user,
    status__in=CURRENT_SUBSCRIPTION_STATUSES,
)
```

It only reloads the user's current effective subscription from the database.

The optimistic stale check is this comparison:

```python
if current_subscription.id != expected_subscription_id:
    raise StaleSubscriptionTransitionError
```

The caller passes:

```python
expected_subscription_id
```

That means:

```text
I am trying to replace the subscription state I previously observed.
Only proceed if that same subscription is still current.
```

If another transition already replaced it, the current subscription ID is different and the request is rejected.

## Is This Similar To A Version Field?

Yes, conceptually.

Classic optimistic locking often looks like:

```sql
UPDATE account
SET balance = 110, version = version + 1
WHERE id = 123 AND version = 7;
```

If zero rows are updated, the caller's version was stale.

Our subscription transition does not use a numeric `version` column. Instead, it checks the identity of the current subscription row:

```text
Expected current row: Free subscription ID
Actual current row: Pro subscription ID
Reject as stale
```

So it is an optimistic stale-state check using `expected_subscription_id`, not a general reusable version-column system.

## Why Use Both Row Locking And The Stale Check?

The row lock serializes execution:

```text
Only one transition for this user can run at a time.
```

The stale check validates intent:

```text
Only replace the exact subscription state the caller observed.
```

Without the lock:
- two transactions could overlap and both write inconsistent state.

Without the stale check:
- the second request could wait, then overwrite the result of the first request after the lock is released.

Together:
- the second request waits;
- after waiting, it reloads current state;
- it sees the state is no longer what it expected;
- it raises `StaleSubscriptionTransitionError`.

## How This Differs From Stripe Checkout Idempotency

Database locks protect local database state.

Stripe Checkout creation is an external side effect:

```python
client.v1.checkout.sessions.create(...)
```

Once the request leaves our process, PostgreSQL cannot lock Stripe.

Failure case:

```text
1. Backend sends POST to Stripe to create a Checkout Session.
2. Stripe creates the session.
3. Network times out before backend receives the response.
4. Backend retries the POST.
5. Without Stripe idempotency, Stripe may create a second Checkout Session.
```

A database row lock cannot tell Stripe that the second `POST` is a retry of the first one.

Stripe idempotency keys solve provider-side duplicate external operations:

```text
Same Stripe idempotency key + same request parameters = same Stripe result.
```

That is different from:

```text
SELECT ... FOR UPDATE = serialize local database transactions.
```

## Checkout Idempotency Shape

Do not use a broad deterministic key like:

```python
f"checkout:{user.id}:{price.id}"
```

That represents all checkout attempts for the same user and price, so it can
collapse a later intentional checkout action into an earlier retry identity.

The implemented shape is:

```text
User clicks checkout
Backend creates CheckoutAttempt(id=uuid4, user, price, status=pending)
CheckoutAttempt.expected_subscription = user's current subscription at checkout creation
Backend calls Stripe with idempotency_key=str(checkout_attempt.id)
Retry of same attempt reuses the same attempt ID
New deliberate checkout action creates a new attempt ID
```

That separates:
- duplicate retries of the same user action;
- a new user action later for the same price.

If Stripe creates a Checkout Session, the attempt stores the provider session
ID and moves to `completed`. In this context, `completed` means provider session
creation completed; it does not mean the user paid or that entitlements changed.
Webhook processing is still required for subscription activation.

## Which Tool To Use

Use a row lock when:
- you need to protect local count-then-write logic;
- local state must be read and written as one atomic unit;
- conflicts must wait instead of racing.

Use an optimistic stale check when:
- a request is based on state the caller previously observed;
- you want to reject stale requests instead of silently overwriting newer state.

Use a Stripe idempotency key when:
- a retry might repeat a Stripe `POST`;
- a network failure could hide whether Stripe completed the operation;
- you need Stripe to recognize repeated attempts as the same external operation.

Use webhook idempotency when:
- Stripe can deliver the same event more than once;
- the same provider event must not apply the same local subscription transition twice.

Current implementation:
- `StripeWebhookEvent.provider_event_id` is unique.
- `process_stripe_webhook_event` inserts the Stripe event ID inside the same transaction as the subscription update.
- If the event ID already exists, processing returns before touching subscription state.
- `checkout.session.completed` must match both `CheckoutAttempt.id` from metadata and `CheckoutAttempt.provider_checkout_session_id` from the Stripe event's session ID before confirming the attempt.
- `checkout.session.completed` must also resolve metadata `subscription_price_id` to a price belonging to metadata `subscription_plan_id`.
- `checkout.session.completed` passes `CheckoutAttempt.expected_subscription_id` into `change_subscription_plan`; if the user's current subscription changed after Checkout started, the stale transition is ignored.
- Checkout creation reuses a local Stripe `BillingCustomer` when present; otherwise the verified completion webhook establishes the first local mapping from the returned Stripe customer ID.
- Webhook reconciliation rejects a provider customer ID that conflicts with the user's existing mapping or belongs to another local user before attempting the subscription transition.
- This protects `checkout.session.completed` retries from creating extra subscription history rows.

The event table is the idempotency ledger:

```text
First delivery:  evt_123 is absent -> insert evt_123 -> apply transition -> commit
Second delivery: evt_123 is present -> duplicate insert rejected -> return without transition
```

The unique `provider_event_id` constraint is the concurrency-safe decision
point. An application-level `if exists` check alone would still race if two
deliveries arrived together. PostgreSQL guarantees that only one transaction
can successfully insert the same unique event ID.

The tests cover both observable layers:

- `test_stripe_webhook_duplicate_delivery_returns_success_once_already_processed`
  proves the HTTP endpoint acknowledges a repeated, already-recorded event with
  `200` and leaves one ledger row.
- `test_checkout_session_completed_is_idempotent_for_duplicate_event` invokes
  the service twice and proves the paid subscription transition is applied
  once.

## Wearable Upload Idempotency

Wearable uploads use two related boundaries:

```text
(wearable_connection, upload_id) = identity of one client upload attempt
payload_hash                     = identity of its validated content
```

The database unique constraint on `(wearable_connection, upload_id)` prevents
two `SyncRun` receipts for the same connection-scoped upload. The same UUID may
be used independently by another connection.

The server-side canonical hash helper:

- accepts only serializer-validated entries;
- sorts entries by their required `external_source_id`;
- identifies definitions by stable slug rather than database primary key;
- normalizes timestamps to UTC with a fixed microsecond representation;
- serializes a versioned canonical JSON shape;
- returns the lowercase SHA-256 digest.

The hash deliberately excludes `connection_id` and `upload_id`; those identify
the receipt, while the hash identifies the content attached to that receipt.
It is a consistency fingerprint, not an authentication signature, and the
server must never trust a client-provided digest.

The intended retry decision is:

```text
new (connection, upload_id)
    -> store the server-computed hash and process once

existing (connection, upload_id) + same hash
    -> return the existing outcome without repeating writes

existing (connection, upload_id) + different hash
    -> reject the conflicting reuse
```

The canonical hash computation and new/exact-retry/conflict HTTP paths are
implemented. `process_wearable_upload()` locks the connection row and writes
the hashed `SyncRun`, normalized `MetricEntry` rows, terminal run state, and
successful connection state inside one database transaction. A failed write
therefore cannot commit only part of that state.

The service safely handles an exact retry: inside the connection
lock, the same `(connection, upload_id, payload_hash)` returns the original
terminal `SyncRun` before any metric or connection-state write is repeated.

Giving the same `(connection, upload_id)` changed content now raises
`WearableUploadConflictError` before any write. An existing blank hash is also
a conflict: its historical receipt proves that the identity was already used,
but cannot prove which entry payload it represented, so the service must not
silently claim it.

For a new upload identity, the service preloads existing external record IDs
for the locked connection. If all normalized fields match, it skips the insert
and increments `entries_skipped`; the new upload still receives its own
successful `SyncRun`. PostgreSQL's conditional unique constraint remains the
final concurrency-safe protection.

Mixed new/duplicate batches are directly covered and report their imported and
skipped counts independently. For the MVP, changed normalized content under an
existing external record ID raises `WearableRecordConflictError` before the
insert. The atomic service rolls back the conflicting `SyncRun` and preserves
the original metric rather than silently rewriting provider history.

The live endpoint requires normalized entries and exposes this policy
synchronously: new work returns `201`, an exact retry returns `200`, and either
wearable ingestion conflict subclass returns `409`.
