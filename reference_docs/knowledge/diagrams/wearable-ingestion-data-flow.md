# Wearable Ingestion Data Flow

## Use When

- You need the end-to-end Samsung Health → Health Connect → Android → Django flow.
- You need to distinguish the implemented upload receipt from the next normalized-ingestion slice.
- You need to reason about `WearableConnection`, `SyncRun`, `MetricEntry`, payload hashing, or upload retries.

## Runtime Flow And Implementation State

```mermaid
flowchart LR
    subgraph Phone["Android phone — planned companion-app slice"]
        SH["Samsung Health<br/>writes a source record"]
        HC["Health Connect<br/>exposes user-permitted records"]
        ANDROID["Android companion app<br/>reads and normalizes records<br/>creates stable upload_id"]

        SH --> HC --> ANDROID
    end

    subgraph Django["Django backend"]
        AUTH["Mobile login<br/>returns access + refresh JWTs"]
        RECEIPT["Upload endpoint<br/>requires IDs + 1–100 normalized entries"]
        OWNER["Authenticate user<br/>validate UUIDs<br/>find active caller-owned connection"]
        BATCH["Normalized batch validation<br/>1–100 strict entries"]
        HASH["Canonical payload hash<br/>versioned server-computed SHA-256"]
        RETRY{"Existing<br/>(connection, upload_id)?"}
        SAME{"Stored hash<br/>matches?"}
        INGEST["Synchronous ingestion service<br/>new, retry, upload/record conflict + dedupe live"]

        RECEIPT --> OWNER
        BATCH --> OWNER
        OWNER -->|"hash validated entries"| HASH
        HASH --> RETRY
        RETRY -->|yes| SAME
        RETRY -->|no| INGEST
        SAME -->|yes| EXISTING["Return existing outcome<br/>without repeated writes"]
        SAME -->|no| CONFLICT["409 Conflict"]
    end

    subgraph Data["PostgreSQL — implemented tables"]
        CONNECTION[("WearableConnection<br/>provider = health_connect")]
        SYNC[("SyncRun<br/>unique(connection, upload_id)<br/>status + counters + payload_hash")]
        ENTRY[("MetricEntry<br/>source = samsung_health<br/>source_connection + external_source_id")]
    end

    subgraph Web["Existing web application"]
        READ["Django metrics API"]
        REACT["React frontend"]
    end

    ANDROID -->|"POST /api/v1/auth/mobile/login/"| AUTH
    AUTH -->|"access JWT"| ANDROID
    ANDROID -. "Future client: Bearer JWT + normalized batch" .-> RECEIPT
    RECEIPT --> BATCH

    OWNER -->|"create or return receipt"| SYNC
    OWNER -->|"resolves"| CONNECTION
    INGEST -->|"persist deduplicated samples"| ENTRY
    INGEST -->|"terminal status + counters"| SYNC
    INGEST -->|"connected + last_synced_at"| CONNECTION

    REACT -->|"GET metric data"| READ
    READ -->|"query entries"| ENTRY
    ENTRY -->|"rows"| READ
    READ -->|"JSON response"| REACT

    classDef implemented fill:#dcfce7,stroke:#15803d,color:#14532d;
    classDef ready fill:#dbeafe,stroke:#1d4ed8,color:#1e3a8a;
    classDef planned fill:#fef3c7,stroke:#b45309,color:#78350f,stroke-dasharray:5 5;
    classDef external fill:#f3f4f6,stroke:#4b5563,color:#111827;

    class AUTH,RECEIPT,OWNER,BATCH,HASH,INGEST,RETRY,SAME,EXISTING,CONFLICT,CONNECTION,SYNC,ENTRY,READ,REACT implemented;
    class ANDROID planned;
    class SH,HC external;
```

Legend:

- Green: live behavior or an implemented durable table/API.
- Blue: implemented and tested in isolation, but not connected to a live boundary.
- Amber dashed: the next end-to-end behavior or the later Android slice.
- Gray: an external on-device system.

## Implemented Normalized Upload Contract

The future Android client will call the already-implemented backend contract:

```http
POST /api/v1/wearables/uploads/
Authorization: Bearer <mobile-access-token>
Content-Type: application/json
```

```json
{
  "connection_id": "7df7e4ab-7e6f-4558-b9be-17c824fbf54e",
  "upload_id": "9ea2c91d-63f-40eb-a6bb-7fbd90c12a34",
  "entries": [
    {
      "metric_definition": "body_weight",
      "value": 78.4,
      "recorded_at": "2026-07-15T08:00:00Z",
      "source": "samsung_health",
      "external_source_id": "health_connect:WeightRecord:record-123"
    }
  ]
}
```

The endpoint processes entries synchronously and returns a terminal `SyncRun`.
New work returns `201`, an exact retry returns `200`, and upload/record
conflicts return `409`.

## Durable Record Relationships

```mermaid
flowchart LR
    USER["User"]
    CONNECTION["WearableConnection<br/>one durable Health Connect identity"]
    RUNS["SyncRun<br/>one row per connection-scoped upload_id"]
    ENTRIES["MetricEntry<br/>wearable samples reference source_connection"]

    USER -->|"owns"| CONNECTION
    CONNECTION -->|"has upload attempts"| RUNS
    CONNECTION -->|"is provenance for"| ENTRIES

    RUNS -. "describes a batch using status,<br/>counters, error and payload hash;<br/>no direct MetricEntry foreign key" .-> ENTRIES
```

Important boundaries:

- The React frontend reads metric data through Django; it never reads PostgreSQL directly.
- `SyncRun` is the upload-attempt ledger, not a second metric store.
- `MetricEntry` references `WearableConnection` through `source_connection`.
  It does not currently reference the `SyncRun` that imported it.
- `provider=health_connect` identifies the device bridge. An entry's
  `source=samsung_health` identifies the application that originally produced
  the record.
- The backend stores Longevity JWT/session state, but no raw Samsung Health or
  Health Connect access tokens.
- The server computes `payload_hash`; the Android client must not provide or
  choose the trusted digest.
- A different upload containing an identical stored external record receives
  its own successful `SyncRun`, but increments `entries_skipped` instead of
  creating another `MetricEntry`.
- Changed normalized content under an existing external record ID raises a
  record-level domain conflict and rolls back the new receipt instead of
  rewriting the stored health record.
