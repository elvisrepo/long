## Use When
- Load this when we are working on the local development architecture.

## Source
- Derived from `reference_docs/knowledge/planning.md` sections 1.9.


#### Local Development Architecture

This diagram shows the current browser/backend runtime plus the newly implemented Android development loop.

The Android companion project is installed/tested on a physical phone through Android Studio, Gradle, and `adb`. Mobile login, encrypted JWT storage, refresh/retry, session restoration, and server-revoking logout now call local Django through `adb reverse`. Backend wearable connection registration and Health Connect reads remain the next client slices.

Redis, Celery Worker, Celery Beat, and TimescaleDB are present in the local runtime, but they are mostly prepared infrastructure at the current project stage. The implemented auth, manual metrics, Settings, Stripe Checkout, Stripe Portal, and Stripe webhook flows run synchronously inside Django. Celery becomes important when wearable sync, backfills, retries, analytics precomputation, and export/delete jobs are implemented. TimescaleDB becomes important when metric volume and range/aggregate queries justify hypertables, continuous aggregates, retention, or compression policies.

```mermaid
graph TB
    subgraph "Developer machine"
        STUDIO["Android Studio<br/>Gradle + adb"]
        VITE["Vite dev server<br/>:5173"]
        BROWSER["Local browser"]

        subgraph "Docker Compose"
            DEV["Django API<br/>:8000"]
            PG[("PostgreSQL + TimescaleDB<br/>:5432")]
            REDIS[("Redis<br/>:6379")]
            CELERY["Celery Worker"]
            BEAT["Celery Beat"]
        end
    end

    subgraph "Physical Android phone"
        APP["Longevity companion app<br/>Kotlin + Compose"]
        HC["Health Connect<br/>next integration"]
        SAMSUNG["Samsung Health"]
    end

    BROWSER --> VITE
    DEV --> PG
    DEV --> REDIS
    CELERY --> PG
    CELERY --> REDIS
    BEAT --> REDIS
    STUDIO -->|"build/install/test over USB"| APP
    SAMSUNG --> HC
    APP -. "next: permission + WeightRecord read" .-> HC
    APP -->|"implemented mobile auth via adb reverse"| DEV
```

**Scope notes**
- The physical phone and Android test runtime are now part of local development.
- The phone is not a second Git repository; `android/` belongs to the root Longevity repository.
- Gradle builds/tests the Android application, while `adb` installs APKs, starts instrumented tests, and later reverses the development API port.
- Android Studio Compose previews and JVM tests do not require a phone. Instrumented Compose tests require an awake, unlocked connected device; a locked/dozing phone can produce “No compose hierarchies found.”
- PostgreSQL is required now; TimescaleDB-specific features are planned leverage rather than active core behavior.
- Redis/Celery/Beat are running-capable locally, but current product behavior does not depend on meaningful asynchronous jobs yet.
- In the Samsung-sync MVP, data is uploaded from an Android companion app; the backend does not call a Samsung cloud API directly.
- Android-to-Django mobile authentication is implemented through `adb reverse`; the Android wearable connection client and Android-to-Health-Connect record reads remain next-step behavior.
