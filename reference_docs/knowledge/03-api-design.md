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

#### Testing (E2E runtime only)
| Method | Endpoint | Description | Notes |
|---|---|---|---|
| POST | `/api/testing/reset/` | Reset the isolated E2E database | Only mounted when `ENABLE_E2E_TESTING_API=True` through `config.settings.e2e`; flushes mutable E2E state, then restores required system seed rows such as default metric definitions; never expose in dev/prod |

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
| GET | `/api/v1/metrics/definitions/` | List available metrics | Implemented; includes active defaults + authenticated user's active custom definitions; optional `include_inactive=true` also includes the authenticated user's inactive custom definitions |
| POST | `/api/v1/metrics/definitions/` | Create custom metric | Implemented for authenticated users; creates user-owned non-default metric definitions |
| PATCH | `/api/v1/metrics/definitions/{id}/` | Update custom metric | Implemented for authenticated user's own custom metric definitions, including inactive ones for reactivation; slug is immutable |
| GET | `/api/v1/metrics/entries/?metric=resting_hr&from=2026-01-01&to=2026-03-01&limit=50` | Query entries | Implemented for authenticated user's entries; supports optional `metric`, `from`, `to`, and positive integer `limit` filters; returns newest first |
| POST | `/api/v1/metrics/entries/` | Log a metric entry | Implemented for manual entries; accepts `metric_definition` as a slug such as `resting_hr`; not idempotent — repeated calls create duplicate entries |
| PATCH | `/api/v1/metrics/entries/{id}/` | Update a metric entry | Implemented for authenticated user's own entries; partial updates allowed; value range validation still applies |
| DELETE | `/api/v1/metrics/entries/{id}/` | Delete a metric entry | Implemented for authenticated user's own entries; returns 204 on success |
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

Current entry listing behavior:
- `GET /api/v1/metrics/entries/` returns only the authenticated user's entries.
- Results are ordered by `recorded_at DESC, id DESC`.
- `metric=<slug>` filters by metric definition slug, for example `metric=resting_hr`.
- `from=<timestamp>` filters entries where `recorded_at >= from`.
- `to=<timestamp>` filters entries where `recorded_at <= to`.
- `limit=<positive integer>` caps returned entries. If omitted, the backend applies the current default limit of `50`.
- Invalid limits such as `0`, negative values, or non-numeric values return `400`.
- Cursor pagination is still planned; the current implementation supports a single bounded result set but does not yet return `next_cursor` or `has_more`.

**Example: Creating a custom metric definition**
```json
POST /api/v1/metrics/definitions/
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...

{
  "name": "Mood",
  "slug": "mood",
  "unit": "score",
  "category": "custom",
  "min_value": 1,
  "max_value": 10
}

// Response: 201 Created
{
  "id": "7bd9858f-4d27-4a30-9f4d-129f0243b9d6",
  "name": "Mood",
  "slug": "mood",
  "unit": "score",
  "category": "custom",
  "min_value": 1.0,
  "max_value": 10.0,
  "is_default": false,
  "is_active": true
}
```

Custom metric-definition create behavior:
- Authentication is required.
- The backend stores the authenticated user on the definition; clients do not submit `user`.
- `is_default` is server-controlled and always `false` for this endpoint.
- A user cannot create a duplicate custom metric slug for their own account.
- A user cannot create a custom metric with a slug already used by a system default metric.
- `max_value` must be greater than `min_value`.
- The current MVP entitlement seam limits each user to 3 active custom metrics. Inactive archived custom metrics and system defaults do not count.
- If the active custom metric limit is reached, create returns `400` with `{"non_field_errors": ["Active custom metric limit reached."]}`.

Custom metric-definition update behavior:
- `PATCH /api/v1/metrics/definitions/{id}/` supports partial updates for an authenticated user's own custom metric definitions, including inactive custom definitions so users can reactivate archived metrics.
- Updateable fields include `name`, `unit`, `category`, `min_value`, `max_value`, and `is_active`.
- `slug` is writable on create but immutable on update because dashboard links, metric-entry creation, and route params use it as the public metric identifier.
- System default metric definitions cannot be updated through this endpoint.
- Another user's custom metric definition returns `404` because it is outside the caller's visible update queryset.
- Range validation still applies during partial updates; if only one bound is submitted, the serializer validates it against the existing stored bound.
- Deactivation is a soft archive, not a hard delete. Existing metric entries remain preserved and readable; inactive metric definitions cannot be used for new entries.
- Reactivating an archived custom metric counts against the active custom metric limit and returns the same `non_field_errors` response if the user is already at the limit.
- Updating metadata on an already-active custom metric is still allowed at the limit because it does not add another active metric.

Custom metric-definition list behavior:
- `GET /api/v1/metrics/definitions/` is active-only by default.
- `GET /api/v1/metrics/definitions/?include_inactive=true` returns active system defaults plus the authenticated user's custom metric definitions, including inactive ones.
- Inactive system defaults remain hidden.
- Another user's custom definitions are never returned, regardless of `include_inactive`.
- Responses include `is_active` so clients can separate active metrics from archived custom metrics.
- See `reference_docs/knowledge/04-data-flow-examples.md` for the full frontend hook → API helper → DRF view/queryset → serializer → TanStack Query cache flow.

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

Metric-entry create behavior:
- `metric_definition` is the public metric slug, not the database UUID.
- The slug lookup is scoped to active system defaults plus the authenticated user's active custom metric definitions.
- The backend stores the authenticated user on the entry; clients do not submit `user`.
- `source` defaults to `manual` for this endpoint.
- `value` is validated against the selected metric definition's `min_value` and `max_value`.
- Inactive metric definitions cannot be used for new entries.
- Another user's custom metric definitions cannot be used, even if the slug is known.

Metric-entry detail behavior:
- `PATCH /api/v1/metrics/entries/{id}/` supports partial updates for an authenticated user's own entry.
- `PATCH` can update fields such as `value`, `recorded_at`, and `context`.
- Update validation still uses the entry's metric definition, so `value` must remain between that metric's `min_value` and `max_value`.
- `DELETE /api/v1/metrics/entries/{id}/` deletes an authenticated user's own entry and returns `204`.
- Entry detail lookups are scoped to `request.user`; another user's entry returns `404` rather than `403` because it is outside the caller's visible queryset.

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
