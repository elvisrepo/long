# Android Companion App End-to-End Flow

## Use When

- You need the complete Android lifecycle from application launch through authentication, Health Connect registration, weight synchronization, token refresh, and logout.
- You need to distinguish explicit initial sync from scheduled incremental WorkManager sync.
- You need to see which responsibilities belong to Compose, Android domain services, Health Connect, Django, and PostgreSQL.

This is a behavioral flow diagram. Structurizr DSL remains the source of truth for C4 architecture views.

## Current Flow

```mermaid
flowchart TD
    START([Launch Longevity]) --> RESTORE["LoginViewModel asks AuthRepository<br/>to restore the encrypted JWT pair"]
    RESTORE --> SESSION{"Readable local<br/>session exists?"}

    SESSION -->|No| FORM["Show login form<br/>User enters email and password"]
    FORM --> LOGIN["HttpAuthRepository<br/>POST /api/auth/mobile/login/"]
    LOGIN --> DJANGO_LOGIN["Django validates credentials<br/>and issues access + refresh JWTs"]
    DJANGO_LOGIN --> LOGIN_OK{"Login successful?"}
    LOGIN_OK -->|No| SAFE_LOGIN_ERROR["Show safe login error<br/>Never log credentials or tokens"]
    SAFE_LOGIN_ERROR --> FORM
    LOGIN_OK -->|Yes| STORE["Encrypt JWTs with Android Keystore<br/>Store ciphertext in private preferences"]
    STORE --> AUTHENTICATED
    SESSION -->|Yes| AUTHENTICATED["Authenticated Android screen"]

    subgraph CONNECTION["Health Connect connection"]
        AUTHENTICATED --> CONNECT_ACTION["User chooses Connect Health Connect"]
        CONNECT_ACTION --> SDK_CHECK["Check Health Connect SDK availability<br/>and existing READ_WEIGHT grant"]
        SDK_CHECK --> SDK_READY{"Available and<br/>permission granted?"}
        SDK_READY -->|Unavailable| CONNECT_RECOVERY["Show unsupported, update-required,<br/>or retryable-unavailable state"]
        SDK_READY -->|Permission needed| PERMISSION["MainActivity launches official<br/>Health Connect permission contract"]
        PERMISSION --> PERMISSION_RESULT{"User grants<br/>READ_WEIGHT?"}
        PERMISSION_RESULT -->|No| CONNECT_RECOVERY
        PERMISSION_RESULT -->|Yes| RESOLVE_CONNECTION
        SDK_READY -->|Yes| RESOLVE_CONNECTION["WearableConnectionRepository<br/>GET /api/v1/wearables/connections/"]
        RESOLVE_CONNECTION --> CONNECTION_EXISTS{"Active health_connect<br/>connection exists?"}
        CONNECTION_EXISTS -->|Yes| READY["Ready with caller-owned connection_id"]
        CONNECTION_EXISTS -->|No| REGISTER["POST /api/v1/wearables/connections/<br/>provider = health_connect"]
        REGISTER --> ENTITLEMENT["Django authenticates caller,<br/>enforces plan limit, and creates/reactivates connection"]
        ENTITLEMENT --> REGISTERED{"Accepted?"}
        REGISTERED -->|No| CONNECT_RECOVERY
        REGISTERED -->|Yes| READY
        READY --> BACKGROUND_CHECK["Check background-read feature<br/>and existing additional-access grant"]
        BACKGROUND_CHECK --> BACKGROUND_ACCESS{"Background access state?"}
        BACKGROUND_ACCESS -->|Granted| BACKGROUND_READY["Background capability ready"]
        BACKGROUND_ACCESS -->|Unsupported| BACKGROUND_UNAVAILABLE["Keep manual sync available<br/>Hide background action"]
        BACKGROUND_ACCESS -->|Permission required| BACKGROUND_ACTION["Show Allow background sync"]
        BACKGROUND_ACTION -->|User taps| BACKGROUND_PERMISSION["Launch official background-read<br/>permission contract in foreground"]
        BACKGROUND_PERMISSION --> BACKGROUND_RESULT{"User grants<br/>additional access?"}
        BACKGROUND_RESULT -->|Yes| BACKGROUND_READY
        BACKGROUND_RESULT -->|No| BACKGROUND_ACTION
    end

    subgraph EXPLICIT_SYNC["Implemented explicit initial weight sync"]
        READY --> SYNC_ACTION["User chooses Sync weight now"]
        SYNC_ACTION --> INITIAL_VM["InitialWeightSyncViewModel<br/>prevents overlapping visible syncs"]
        INITIAL_VM --> COORDINATOR["WeightSyncCoordinator"]
        COORDINATOR --> INITIAL_PLANNER["InitialWeightSyncPlanner<br/>selects the previous 30 days"]
        INITIAL_PLANNER --> HC_READ["AndroidHealthConnectAccess<br/>reads every WeightRecord page"]
        SAMSUNG["Samsung Health"] -->|Writes on-device records| HEALTH_CONNECT["Health Connect"]
        HEALTH_CONNECT -->|Returns permitted records| HC_READ
        HC_READ --> FILTER["Keep Samsung-originated samples<br/>Sort and batch at most 100 entries"]
        FILTER --> UPLOAD_ID["Generate one retry-stable upload_id<br/>for each batch attempt"]
        UPLOAD_ID --> UPLOAD["HttpWearableUploadRepository<br/>POST /api/v1/wearables/uploads/"]
        UPLOAD --> AUTH_CLIENT["AuthenticatedApiClient<br/>adds stored Bearer access token"]
        AUTH_CLIENT --> DJANGO_AUTH["Django checks the Bearer access token"]
        DJANGO_AUTH --> API_RESPONSE
        API_RESPONSE -->|No| INGEST["Django validates ownership,<br/>payload bounds, hash, and idempotency"]
        INGEST --> DATABASE[("PostgreSQL<br/>WearableConnection + SyncRun + MetricEntry")]
        DATABASE --> RECEIPT["Return 201 new receipt,<br/>200 exact retry, or safe conflict/rejection"]
        RECEIPT --> RESULT["Coordinator returns Completed,<br/>NoData, or Interrupted"]
        RESULT --> SYNC_UI["Compose shows safe aggregate<br/>imported/skipped or recovery state"]
        DATABASE --> WEB["React web app later reads the same<br/>MetricEntry rows through Django"]
    end

    subgraph REFRESH["On-demand access-token refresh for product API calls"]
        API_RESPONSE{"Protected request<br/>returns 401?"}
        API_RESPONSE -->|Yes| REFRESH_LOCK["Mutex coordinates refresh<br/>and rereads token storage"]
        REFRESH_LOCK --> ALREADY_ROTATED{"Another request already<br/>replaced the access token?"}
        ALREADY_ROTATED -->|Yes| RETRY_REQUEST["Retry original request once<br/>with replacement access token"]
        ALREADY_ROTATED -->|No| REFRESH_REQUEST["POST /api/auth/mobile/refresh/<br/>with stored refresh token"]
        REFRESH_REQUEST --> REFRESH_OK{"Refresh accepted?"}
        REFRESH_OK -->|Yes| REPLACE_TOKENS["Store replacement access token<br/>and rotated refresh token when supplied"]
        REPLACE_TOKENS --> RETRY_REQUEST
        RETRY_REQUEST --> DJANGO_AUTH
        REFRESH_OK -->|No session| SESSION_EXPIRED["Clear rejected session<br/>and require login"]
        REFRESH_OK -->|Temporary failure| RETRYABLE_API_ERROR["Keep session and return<br/>retryable unavailable outcome"]
    end

    subgraph BACKGROUND["Implemented periodic incremental weight sync"]
        BACKGROUND_READY --> SCHEDULE["WorkManagerWeightSyncScheduler<br/>enqueues unique work for connection_id<br/>UPDATE policy · network required · 15-minute minimum"]
        SCHEDULE --> WORKER["IncrementalWeightSyncWorker<br/>validates connection_id"]
        WORKER --> INCREMENTAL_RUNNER["Injected IncrementalWeightSyncRunner"]
        INCREMENTAL_RUNNER --> CURSOR["Load per-connection cursor<br/>use 24-hour overlap or 30-day fallback"]
        CURSOR --> HC_READ
        RESULT -. "When the incremental runner owns this attempt" .-> CURSOR_DECISION{"Completed or<br/>valid NoData?"}
        CURSOR_DECISION -. Yes .-> CURSOR_ADVANCE["Persist the pre-read watermark"]
        CURSOR_DECISION -. Interrupted .-> KEEP_CURSOR["Leave the previous cursor unchanged"]
        CURSOR_ADVANCE --> WORK_RESULT["Worker maps the returned domain result:<br/>success, retry, or failure"]
        KEEP_CURSOR --> WORK_RESULT
    end

    subgraph LOGOUT["Logout"]
        AUTHENTICATED --> LOGOUT_ACTION["User chooses Logout"]
        LOGOUT_ACTION --> REVOKE["POST /api/auth/mobile/logout/<br/>with stored refresh token"]
        REVOKE --> LOGOUT_OK{"Server revocation<br/>successful?"}
        LOGOUT_OK -->|Yes| CLEAR["Delete encrypted local JWT pair<br/>Reset wearable ViewModels and cancel visible sync"]
        CLEAR --> FORM
        LOGOUT_OK -->|No| LOGOUT_RETRY["Retain session so revocation<br/>can be retried honestly"]
        LOGOUT_RETRY --> AUTHENTICATED
        CLEAR --> CANCEL_WORK["Cancel every weight-sync request<br/>through the stable WorkManager tag"]
    end

    classDef implemented fill:#dcfce7,stroke:#15803d,color:#14532d;
    classDef decision fill:#dbeafe,stroke:#1d4ed8,color:#1e3a8a;
    classDef external fill:#f3f4f6,stroke:#4b5563,color:#111827;
    classDef storage fill:#ede9fe,stroke:#7c3aed,color:#4c1d95;
    classDef planned fill:#fef3c7,stroke:#b45309,color:#78350f,stroke-dasharray:5 5;
    classDef recovery fill:#fee2e2,stroke:#dc2626,color:#7f1d1d;

    class START,RESTORE,FORM,LOGIN,DJANGO_LOGIN,STORE,AUTHENTICATED,CONNECT_ACTION,SDK_CHECK,PERMISSION,RESOLVE_CONNECTION,REGISTER,ENTITLEMENT,READY,BACKGROUND_CHECK,BACKGROUND_READY,BACKGROUND_UNAVAILABLE,BACKGROUND_ACTION,BACKGROUND_PERMISSION,SCHEDULE,SYNC_ACTION,INITIAL_VM,COORDINATOR,INITIAL_PLANNER,HC_READ,FILTER,UPLOAD_ID,UPLOAD,AUTH_CLIENT,DJANGO_AUTH,INGEST,RECEIPT,RESULT,SYNC_UI,WEB,REFRESH_LOCK,RETRY_REQUEST,REFRESH_REQUEST,REPLACE_TOKENS,WORKER,INCREMENTAL_RUNNER,CURSOR,WORK_RESULT,CURSOR_ADVANCE,KEEP_CURSOR,LOGOUT_ACTION,REVOKE,CLEAR,CANCEL_WORK implemented;
    class SESSION,LOGIN_OK,SDK_READY,PERMISSION_RESULT,CONNECTION_EXISTS,REGISTERED,BACKGROUND_ACCESS,BACKGROUND_RESULT,API_RESPONSE,ALREADY_ROTATED,REFRESH_OK,CURSOR_DECISION,LOGOUT_OK decision;
    class SAMSUNG,HEALTH_CONNECT external;
    class DATABASE storage;
    class SAFE_LOGIN_ERROR,CONNECT_RECOVERY,SESSION_EXPIRED,RETRYABLE_API_ERROR,LOGOUT_RETRY recovery;
```

## Important Boundaries

- Passwords are used only for login and are never persisted by the Android app.
- Access and refresh JWTs are encrypted through Android Keystore before durable storage.
- Refresh happens only after a protected API request receives `401`; ordinary app startup reuses a readable local session without rotating it.
- Weight permission is requested before backend connection registration, so denial does not consume a plan slot. Background permission is separate and optional after the connection is ready.
- The Android app reads Health Connect. Django and Celery cannot directly access on-device records.
- `SyncRun` records an upload attempt; `MetricEntry` remains the canonical metric store.
- Explicit initial synchronization is implemented and physically validated.
- Background feature detection and foreground permission consent are implemented. A grant schedules one unique, network-constrained periodic weight job per connection using UPDATE semantics.
- Startup session checking preserves durable work. Confirmed logout cancels all tagged weight work; connection-disconnect cancellation remains planned with the Android disconnect UI.
