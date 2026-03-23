### 1.7 API Design

## Use When
- Load this when you need the api design.

## Source
- Derived from `reference_docs/knowledge/planning.md` sections 1.7.

**Protocol: REST.** Standard CRUD operations over HTTP, resources map directly to our entities. No reason to use GraphQL (we don't have complex nested queries or multiple client types with different data needs) or gRPC (no microservices, no internal service-to-service calls). REST is well-understood, has great Django/DRF tooling, and covers 100% of our use cases.

**Versioning:** URL-based (`/api/v1/`). Explicit, easy to test, easy to route.

**Auth:** The current backend auth implementation is split by client transport. Mobile auth uses explicit JWT token submission. Web auth uses JWT access tokens plus cookie-based refresh/logout with CSRF. Rate limiting should still be applied at the auth layer (5 login attempts/min, 3 password resets/hour).

#### Auth (public — no JWT required)
| Method | Endpoint | Description | Notes |
|---|---|---|---|
| POST | `/api/auth/register/` | User registration | Returns 201 + user object |
| GET | `/api/auth/csrf/` | Issue CSRF cookie for SPA bootstrap | Web clients call this before cookie-based refresh/logout |
| POST | `/api/auth/web/login/` | Web login | Returns `access` only in JSON and sets the refresh token in an `HttpOnly` cookie |
| POST | `/api/auth/web/refresh/` | Web refresh | Cookie-only, CSRF-protected |
| POST | `/api/auth/web/logout/` | Web logout | Cookie-only, CSRF-protected, blacklists refresh token |
| POST | `/api/auth/mobile/login/` | Mobile login | Returns access + refresh tokens in JSON |
| POST | `/api/auth/mobile/refresh/` | Mobile refresh | Refresh token supplied explicitly in request body |
| POST | `/api/auth/mobile/logout/` | Mobile logout | Refresh token supplied explicitly in request body |
| POST | `/api/v1/auth/password/reset/` | Password reset email | Planned, rate limited: 3/hour |
| POST | `/api/v1/auth/password/confirm/` | Confirm password reset | Planned |

#### User & Profile (JWT required)
| Method | Endpoint | Description | Notes |
|---|---|---|---|
| GET | `/api/v1/me/` | Current user profile | |
| PATCH | `/api/v1/me/` | Update profile (partial) | PATCH not PUT — only send fields to change |
| GET | `/api/v1/me/export/` | GDPR data export | Returns 202 Accepted, async job |
| DELETE | `/api/v1/me/` | GDPR account deletion | Idempotent — repeated calls return 204 |

#### Metrics (JWT required)
| Method | Endpoint | Description | Notes |
|---|---|---|---|
| GET | `/api/v1/metrics/definitions/` | List available metrics | Includes defaults + user's custom ones |
| POST | `/api/v1/metrics/definitions/` | Create custom metric (R5+) | |
| GET | `/api/v1/metrics/entries/?metric=resting_hr&from=2026-01-01&to=2026-03-01` | Query entries | Cursor-based pagination. Path params not needed — all filters are optional |
| POST | `/api/v1/metrics/entries/` | Log a metric entry | Not idempotent — repeated calls create duplicate entries |
| POST | `/api/v1/metrics/entries/bulk/` | Bulk import | |
| GET | `/api/v1/metrics/analytics/{slug}/?range=30d` | Analytics for one metric | `slug` is required (path param), `range` is optional (query param, default 30d) |

**Pagination (cursor-based for entries):**
```json
GET /api/v1/metrics/entries/?metric=resting_hr&limit=20

{
  "results": [
    {"id": 984312, "value": 58, "recorded_at": "2026-03-05T07:15:00Z", "source": "samsung_health"},
    ...
  ],
  "next_cursor": "eyJyZWNvcmRlZF9hdCI6ICIyMDI2LTAzLTA1VDA3OjE1OjAwWiIsICJpZCI6IDk4NDMxMn0=",
  "has_more": true
}

// Next page:
GET /api/v1/metrics/entries/?metric=resting_hr&cursor=eyJyZWNvcmRlZF9hdCI6ICIyMDI2LTAzLTA1VDA3OjE1OjAwWiIsICJpZCI6IDk4NDMxMn0=&limit=20
```
Cursor-based (not offset-based) because metric entries are time-series data — new entries are constantly added, and offset pagination would cause duplicates/gaps. Results are ordered by `recorded_at DESC, id DESC`, and the cursor encodes both values so backfills and out-of-order inserts don't skip or duplicate rows.

**Data passing convention:**
- **Path params** → required resource identifiers (`/analytics/{slug}/`, `/wearables/connections/{id}/`)
- **Query params** → optional filters and modifiers (`?metric=resting_hr&from=2026-01-01&range=30d&limit=20`)
- **Request body** → data payloads for creating/updating resources

**Example: Logging a metric entry**
```json
POST /api/v1/metrics/entries/
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...

{
  "metric_definition": "resting_hr",
  "value": 58,
  "recorded_at": "2026-03-05T07:15:00Z",
  "context": {"notes": "morning measurement"}
}

// Response: 201 Created
{
  "id": 984312,
  "metric_definition": "resting_hr",
  "value": 58,
  "recorded_at": "2026-03-05T07:15:00Z",
  "source": "manual",
  "context": {"notes": "morning measurement"},
  "created_at": "2026-03-05T07:15:02Z"
}
```

#### Subscriptions (R4+, JWT required)
| Method | Endpoint | Description | Notes |
|---|---|---|---|
| GET | `/api/v1/subscriptions/plans/` | Available plans | Public-ish — could be unauthenticated |
| POST | `/api/v1/subscriptions/checkout/` | Create Stripe Checkout session | Returns redirect URL, idempotent per session |
| POST | `/api/v1/subscriptions/portal/` | Stripe Customer Portal link | |
| POST | `/api/v1/webhooks/stripe/` | Stripe webhook receiver | No JWT — uses Stripe signature verification instead |

#### Samsung / Wearables (R2 internal spike, R3 MVP, JWT required)
| Method | Endpoint | Description | Notes |
|---|---|---|---|
| GET | `/api/v1/wearables/connections/` | List linked sync connections | MVP returns Samsung/Android device-bridge connections |
| POST | `/api/v1/wearables/connections/` | Register or refresh a wearable connection | Body includes `provider`, `connection_mode`, `platform`, and client metadata |
| GET | `/api/v1/wearables/connections/{id}/status/` | Fetch sync state for one connection | Includes `status`, `last_synced_at`, and last error details |
| POST | `/api/v1/wearables/uploads/` | Upload a normalized wearable metric batch | Idempotent via `upload_id`; called by the Android companion app |
| DELETE | `/api/v1/wearables/connections/{id}/` | Disconnect provider | Idempotent |
| POST | `/api/v1/wearables/connections/{id}/resync/` | Request replay / resync from the client | Returns 202 Accepted — backend records replay intent and the Android client performs the upload |

MVP Samsung sync does **not** use provider webhooks or a hosted provider link flow. The Android companion app reads Samsung-originated data on device, uploads batches to our API, and the backend handles validation, deduplication, and persistence. A future aggregator webhook receiver can be added later for providers with cloud-friendly APIs.

**Example: Uploading a Samsung sync batch**
```json
POST /api/v1/wearables/uploads/
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...

{
  "connection_id": "conn-001",
  "upload_id": "9ea2c91d-63f4-40eb-a6bb-7fbd90c12a34",
  "cursor": "2026-03-05T07:15:00Z",
  "entries": [
    {
      "metric_definition": "resting_hr",
      "value": 58,
      "recorded_at": "2026-03-05T07:15:00Z",
      "source": "samsung_health",
      "external_source_id": "samsung:heart_rate:1741168500"
    }
  ]
}

// Response: 202 Accepted
{
  "connection_id": "conn-001",
  "upload_id": "9ea2c91d-63f4-40eb-a6bb-7fbd90c12a34",
  "status": "queued"
}
```

#### Real-Time Streaming (R5+)
```
ws://host/ws/metrics/stream/
```
Not REST — persistent WebSocket connection. Ticket-based auth (short-lived token from REST endpoint, included in WS handshake). Used for live dashboard updates when new manual or wearable data lands; not for direct device-to-server streaming in MVP.
