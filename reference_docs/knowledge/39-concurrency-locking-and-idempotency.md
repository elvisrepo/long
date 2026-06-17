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

## Correct Checkout Idempotency Shape

The current deterministic key:

```python
f"checkout:{user.id}:{price.id}"
```

is too broad for production because it represents all checkout attempts for the same user and price.

The better design is:

```text
User clicks checkout
Backend creates CheckoutAttempt(id=uuid4, user, price, status=pending)
Backend calls Stripe with idempotency_key=str(checkout_attempt.id)
Retry of same attempt reuses the same attempt ID
New deliberate checkout action creates a new attempt ID
```

That separates:
- duplicate retries of the same user action;
- a new user action later for the same price.

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

