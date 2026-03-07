### 1.7 API Design

## Use When
- Load this when you need the api design.

## Source
- Derived from `reference_docs/knowledge/planning.md` sections 1.7.

**Protocol: REST.** Standard CRUD operations over HTTP, resources map directly to our entities. No reason to use GraphQL (we don't have complex nested queries or multiple client types with different data needs) or gRPC (no microservices, no internal service-to-service calls). REST is well-understood, has great Django/DRF tooling, and covers 100% of our use cases.

**Versioning:** URL-based (`/api/v1/`). Explicit, easy to test, easy to route.

**Auth:** All endpoints except register/login require a valid JWT in the `Authorization: Bearer <token>` header. Rate limiting applied at the auth layer (5 login attempts/min, 3 password resets/hour).

#### Auth (public — no JWT required)
| Method | Endpoint | Description | Notes |
|---|---|---|---|
| POST | `/api/v1/auth/register/` | User registration | Returns 201 + user object |
| POST | `/api/v1/auth/login/` | JWT token pair | Returns access + refresh tokens |
| POST | `/api/v1/auth/refresh/` | Refresh access token | Idempotent — same refresh token gives same access token |
| POST | `/api/v1/auth/logout/` | Blacklist refresh token | |
| POST | `/api/v1/auth/password/reset/` | Password reset email | Rate limited: 3/hour |
| POST | `/api/v1/auth/password/confirm/` | Confirm password reset | |

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
| POST | `/api/v1/metrics/definitions/` | Create custom metric (R2+) | |
| GET | `/api/v1/metrics/entries/?metric=resting_hr&from=2026-01-01&to=2026-03-01` | Query entries | Cursor-based pagination. Path params not needed — all filters are optional |
| POST | `/api/v1/metrics/entries/` | Log a metric entry | Not idempotent — repeated calls create duplicate entries |
| POST | `/api/v1/metrics/entries/bulk/` | Bulk import | |
| GET | `/api/v1/metrics/analytics/{slug}/?range=30d` | Analytics for one metric | `slug` is required (path param), `range` is optional (query param, default 30d) |

**Pagination (cursor-based for entries):**
```json
GET /api/v1/metrics/entries/?metric=resting_hr&limit=20

{
  "results": [
    {"id": 984312, "value": 58, "recorded_at": "2026-03-05T07:15:00Z", "source": "garmin"},
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

#### Subscriptions (R2+, JWT required)
| Method | Endpoint | Description | Notes |
|---|---|---|---|
| GET | `/api/v1/subscriptions/plans/` | Available plans | Public-ish — could be unauthenticated |
| POST | `/api/v1/subscriptions/checkout/` | Create Stripe Checkout session | Returns redirect URL, idempotent per session |
| POST | `/api/v1/subscriptions/portal/` | Stripe Customer Portal link | |
| POST | `/api/v1/webhooks/stripe/` | Stripe webhook receiver | No JWT — uses Stripe signature verification instead |

#### Wearables (R3+, JWT required)
| Method | Endpoint | Description | Notes |
|---|---|---|---|
| GET | `/api/v1/wearables/connections/` | List linked wearable providers | |
| POST | `/api/v1/wearables/connect/{provider}/` | Start hosted link flow | `provider` is required — path param. MVP providers: Garmin, Fitbit, Oura, Withings |
| DELETE | `/api/v1/wearables/connections/{id}/` | Disconnect provider | Idempotent |
| POST | `/api/v1/wearables/connections/{id}/resync/` | Trigger backfill / resync | Returns 202 Accepted — async via Celery if provider supports it |
| POST | `/api/v1/webhooks/wearables/` | Wearable aggregator webhook receiver | No JWT — signed webhook verification |

#### Real-Time Streaming (R4+)
```
ws://host/ws/metrics/stream/
```
Not REST — persistent WebSocket connection. Ticket-based auth (short-lived token from REST endpoint, included in WS handshake). Used for live dashboard updates when new manual or wearable data lands; not for direct device-to-server streaming in MVP.