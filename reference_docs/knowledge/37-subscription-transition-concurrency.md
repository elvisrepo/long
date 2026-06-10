# Subscription Transition Concurrency

## Use When
- Load this when you need to understand concurrent subscription transitions, PostgreSQL row locks, Django transactions, or the subscription concurrency test.
- Use this before changing `change_subscription_plan()` or `tests/test_subscription_concurrency.py`.

## Purpose

The concurrency test proves that two plan-transition requests for the same user cannot modify subscription state at exactly the same time.

The requests are serialized:

1. The first transition locks the user's database row.
2. It cancels the current subscription and creates its replacement.
3. The second transition waits in PostgreSQL.
4. The first transaction commits and releases the lock.
5. The second transition acquires the lock and reads the newly committed state.
6. It then performs its own transition.

The test does **not** update a `SubscriptionPlan` row. Plans such as Free, Pro, and Premium remain shared definitions. It updates the user's subscription history:

```text
Initial:
Free       active

After transaction 1 commits:
Free       cancelled
Pro        active

After transaction 2 commits:
Free       cancelled
Pro        cancelled
Premium    active
```

Both transitions succeed sequentially. The second committed transition determines the user's final effective plan.

## Runtime Structure

The two workers run as OS threads inside one Python/pytest process. PostgreSQL runs in a separate Docker container and handles each thread's database connection independently.

```mermaid
flowchart TB
    subgraph Host["Fedora Host"]
        subgraph WebContainer["backend-web Docker Container"]
            Pytest["Python Process: pytest"]

            Main["Main Test Thread"]
            T1["Worker Thread 1<br/>Free → Pro"]
            T2["Worker Thread 2<br/>Pro → Premium"]

            Events["Shared in-process Events<br/>first_transition_created<br/>release_first_transaction<br/>second_transition_started<br/>second_transition_finished"]

            Pytest --> Main
            Main -->|"ThreadPoolExecutor.submit()"| T1
            Main -->|"ThreadPoolExecutor.submit()"| T2

            Main <--> Events
            T1 <--> Events
            T2 <--> Events

            Conn1["Django/Psycopg Connection 1"]
            Conn2["Django/Psycopg Connection 2"]

            T1 --> Conn1
            T2 --> Conn2
        end

        subgraph DBContainer["PostgreSQL Docker Container"]
            PG1["PostgreSQL Backend Process 1"]
            PG2["PostgreSQL Backend Process 2"]
            LockManager["PostgreSQL Lock Manager"]
            UserRow[("users_user row<br/>Alice")]
            SubscriptionRows[("subscription rows")]

            PG1 <--> LockManager
            PG2 <--> LockManager
            LockManager --> UserRow
            PG1 --> SubscriptionRows
            PG2 --> SubscriptionRows
        end

        Conn1 <-->|"TCP connection"| PG1
        Conn2 <-->|"TCP connection"| PG2
    end
```

## Execution Sequence

```mermaid
sequenceDiagram
    participant M as Main pytest thread
    participant T1 as Worker thread 1
    participant C1 as Psycopg connection 1
    participant P1 as PostgreSQL backend 1
    participant L as PostgreSQL lock manager
    participant P2 as PostgreSQL backend 2
    participant C2 as Psycopg connection 2
    participant T2 as Worker thread 2

    M->>T1: submit change_to_pro()

    T1->>C1: BEGIN outer transaction
    C1->>P1: BEGIN

    T1->>C1: SELECT user FOR UPDATE
    C1->>P1: SELECT ... FOR UPDATE
    P1->>L: Request lock on Alice's row
    L-->>P1: Lock granted to transaction 1

    Note over T1,P1: change_subscription_plan() enters a nested atomic block

    T1->>C1: Find current subscription
    C1->>P1: SELECT current subscription
    P1-->>T1: Free / active

    T1->>C1: Cancel Free
    C1->>P1: UPDATE Free SET status=cancelled

    T1->>C1: Create Pro
    C1->>P1: INSERT Pro / active

    T1->>M: first_transition_created.set()
    Note over T1: Wait before committing outer transaction

    M->>T2: submit change_to_premium()
    T2->>M: second_transition_started.set()

    T2->>C2: BEGIN transaction
    C2->>P2: BEGIN

    T2->>C2: SELECT user FOR UPDATE
    C2->>P2: SELECT ... FOR UPDATE
    P2->>L: Request lock on Alice's row

    Note over P2,L: Lock is held by transaction 1<br/>PostgreSQL blocks backend 2
    Note over T2,C2: Thread 2 waits on its database socket

    M->>M: Verify second_transition_finished is false
    M->>T1: release_first_transaction.set()

    T1->>C1: COMMIT outer transaction
    C1->>P1: COMMIT
    P1->>L: Release Alice's row lock

    L-->>P2: Lock granted to transaction 2
    P2-->>T2: SELECT FOR UPDATE completes

    T2->>C2: Find current subscription
    C2->>P2: SELECT current subscription
    P2-->>T2: Pro / active

    T2->>C2: Cancel Pro
    C2->>P2: UPDATE Pro SET status=cancelled

    T2->>C2: Create Premium
    C2->>P2: INSERT Premium / active

    T2->>C2: COMMIT
    C2->>P2: COMMIT
    P2->>L: Release Alice's row lock

    T2->>M: second_transition_finished.set()
```

## Thread And Process Levels

1. `pytest` runs as one Python process inside the backend container.
2. The main pytest thread executes the test function.
3. `ThreadPoolExecutor(max_workers=2)` creates two worker threads in that process.
4. `Event` objects are shared-memory synchronization primitives inside the Python process.
5. Each worker calls `close_old_connections()` so Django establishes a thread-local database connection.
6. Each Psycopg connection is a separate TCP connection to PostgreSQL.
7. PostgreSQL normally assigns a separate backend process to each client connection.
8. Thread one’s PostgreSQL process obtains the user-row lock.
9. Thread two’s PostgreSQL process waits in PostgreSQL’s lock manager.
10. While waiting on database I/O, Python can run the main thread and other worker.
11. Committing transaction one releases the row lock.
12. PostgreSQL wakes transaction two, which reads the newly committed Pro subscription.

## Guarantees And Limits

The row lock and conditional unique constraint guarantee:

- transitions for one user execute sequentially;
- only one current subscription remains;
- each replaced subscription is preserved as cancelled history;
- different users can transition concurrently because they lock different user rows.

They do not guarantee that the first requested plan wins. If two valid transitions are submitted, both may succeed sequentially and the last committed transition becomes current.

For user-driven HTTP requests, this is typically last-write-wins behavior. Stripe webhook processing will also need event idempotency and ordering rules so an old or replayed event cannot overwrite newer subscription state merely because it acquires the lock later.
