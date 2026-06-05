## Architecture Decision Notes

## Use When
- Load this when you need architecture tradeoffs, alternatives considered, accepted downsides, or the rationale behind technical decisions.

## Source
- Derived from current repository implementation choices and project discussions.

### ADR-001: Use Docker Compose for Backend Local Development

- Status: Accepted
- Date: 2026-03-13
- Decision:
  Use Docker Compose as the standard local runtime for backend development.
- Alternatives considered:
  Run Django on the host with locally installed PostgreSQL and Redis.
- Why we chose it:
  Keeps service topology consistent, reduces machine-specific setup drift, and matches the planned local development architecture.
- Downsides:
  Adds Docker-specific debugging and container lifecycle overhead.
- Revisit when:
  The team intentionally moves away from containerized local development.

### ADR-002: Use `backend/.env` as the Single Local Backend Env File

- Status: Accepted
- Date: 2026-03-13
- Decision:
  Keep backend local environment variables in `backend/.env`.
- Alternatives considered:
  Repo-root `.env`, multiple env files, or service-specific env files.
- Why we chose it:
  Keeps the current backend workflow simple and removes ambiguity about which file is authoritative.
- Downsides:
  A future repo-root orchestration setup may require revisiting the convention.
- Revisit when:
  A root-level multi-service runtime becomes the default.

### ADR-003: Use TimescaleDB Instead of Plain PostgreSQL from the Start

- Status: Accepted
- Date: 2026-03-13
- Decision:
  Use a TimescaleDB image for local development instead of plain PostgreSQL.
- Alternatives considered:
  Start with plain PostgreSQL and add Timescale later.
- Why we chose it:
  The roadmap includes time-series analytics and Timescale-specific querying patterns, so adopting it early reduces migration and parity risk.
- Downsides:
  Slightly more specialized infrastructure from day one.
- Revisit when:
  Time-series features are removed from the product direction.

### ADR-004: Use Celery for Application Background Work

- Status: Accepted
- Date: 2026-03-13
- Decision:
  Use Celery for application-level background jobs and scheduled tasks.
- Alternatives considered:
  Cron jobs, systemd timers, ad hoc management commands.
- Why we chose it:
  The product roadmap needs queue-based async execution, retries, and periodic scheduling for webhook handling, backfills, and other non-request work.
- Downsides:
  Adds worker and scheduler infrastructure earlier.
- Revisit when:
  Async requirements remain trivial enough that a task queue is unnecessary.

### ADR-005: Use Redis Instead of RabbitMQ as the Initial Celery Broker

- Status: Accepted
- Date: 2026-03-13
- Decision:
  Use Redis as the initial Celery broker.
- Alternatives considered:
  RabbitMQ.
- Why we chose it:
  Redis is simpler to operate for the current stage and already fits the planned stack for broker and cache use.
- Downsides:
  RabbitMQ offers stronger broker semantics and more advanced routing capabilities.
- Revisit when:
  Delivery guarantees or routing complexity justify a more specialized broker.

### ADR-006: Bake Dependencies into the Image and Bind-Mount Source Code Only

- Status: Accepted
- Date: 2026-03-13
- Decision:
  Install Python dependencies into `/opt/venv` during image build and bind-mount only source code at runtime.
- Alternatives considered:
  Keep the Python environment in `/app/.venv` backed by a named Docker volume and bootstrap it with startup scripts.
- Why we chose it:
  It simplifies container startup, avoids conflicts with the `.:/app` bind mount, and keeps runtime behavior closer to container best practice.
- Downsides:
  Dependency changes require an image rebuild rather than runtime syncing.
- Revisit when:
  Local development needs a different build/runtime tradeoff.

### ADR-007: Use Direct Compose Commands for Celery Services

- Status: Accepted
- Date: 2026-03-13
- Decision:
  Run Celery worker and Celery Beat directly from `docker-compose.yml` commands instead of wrapper startup scripts.
- Alternatives considered:
  Wrapper shell scripts that bootstrap dependencies at container startup.
- Why we chose it:
  Once dependencies are baked into the image, direct commands are simpler, clearer, and less error-prone than extra runtime scripts.
- Downsides:
  Commands become a little longer in Compose.
- Revisit when:
  Application startup logic becomes complex enough to justify dedicated entrypoint scripts again.

### ADR-008: Use Celery Autodiscovery for Django App Tasks

- Status: Accepted
- Date: 2026-03-13
- Decision:
  Use `app.autodiscover_tasks()` instead of hardcoded `include=[...]`.
- Alternatives considered:
  Explicit Celery task module includes.
- Why we chose it:
  This matches normal Django app structure and scales naturally as `users`, `metrics`, and future apps add `tasks.py`.
- Downsides:
  Tasks must live in installed Django apps to be discovered automatically.
- Revisit when:
  Non-Django task modules become a primary part of the architecture.

### ADR-009: Use JWT for Product API Auth and Django Sessions for Admin

- Status: Accepted
- Date: 2026-03-14
- Decision:
  Use JWT for product-facing API authentication and keep Django's built-in session authentication for Django admin.
- Alternatives considered:
  Use Django sessions everywhere, or use JWT everywhere including admin.
- Why we chose it:
  The product has API clients beyond the browser, especially the planned Android app, so JWT is the better fit for the product surface. Django admin remains server-rendered and already aligns well with session auth.
- Downsides:
  The system carries two auth mechanisms with different operational concerns. JWT logout and token invalidation are more complex than session invalidation and require explicit refresh-token handling.
- Revisit when:
  The product surface changes enough that a single auth transport becomes clearly preferable across both admin and client applications.

### ADR-010: Encrypt User Email at Rest and Authenticate via Lookup Hash

- Status: Accepted
- Date: 2026-03-16
- Decision:
  Store user email encrypted at rest, keep a keyed `email_lookup_hash` for exact-match lookup and uniqueness, and authenticate through a custom Django auth backend that resolves users by that lookup hash. Require dedicated crypto secrets instead of reusing `SECRET_KEY`.
- Alternatives considered:
  Store plaintext email, use a plain unsalted hash for lookup, require authentication against the encrypted email column directly, or derive encryption keys ad hoc from `SECRET_KEY`.
- Why we chose it:
  Email is user PII and should not sit in the database as plaintext. At the same time, login and uniqueness checks need a stable query key. A keyed lookup hash provides that stable key, and a custom backend avoids forcing authentication through a unique plaintext-style email column. Requiring explicit crypto keys keeps encryption and lookup concerns decoupled from Django's general-purpose `SECRET_KEY`.
- Downsides:
  The auth path is more complex than Django's default setup, and key management becomes a real operational concern. Fernet key rotation and ciphertext migration are not solved just by introducing the encrypted field. The design also accepts Django's `auth.W004` warning because `USERNAME_FIELD` remains `email` while actual lookup is handled by the custom backend.
- Revisit when:
  The project adopts a more formal field-encryption/key-rotation system or a different identity model.

### ADR-011: Use Hardened JWT Transport and Server-Side Refresh Revocation

- Status: Accepted
- Date: 2026-03-19
- Decision:
  Use short-lived JWT access tokens in the `Authorization` header, use refresh-token rotation and blacklist/revocation, transport the web refresh token in an `HttpOnly`, `Secure` cookie, and keep Android tokens in secure platform storage.
- Alternatives considered:
  Pure client-managed logout, returning both tokens only in JSON for every client, storing long-lived tokens in browser-readable storage, or inventing custom refresh-token revocation logic.
- Why we chose it:
  This gives stronger logout semantics, reduces XSS exposure for the long-lived refresh token on the web, and stays aligned with SimpleJWT's intended extension points instead of introducing custom token infrastructure too early.
- Downsides:
  The implementation is more complex than a minimal stateless JWT setup. Cookie-based refresh and logout flows require explicit CSRF handling, and web/mobile token transport rules must stay intentionally different.
- Revisit when:
  The product transport model changes enough that cookie-based web refresh or server-side refresh revocation no longer fit the client mix.

### ADR-012: Split Web and Mobile Auth Transport Contracts

- Status: Accepted
- Date: 2026-03-23
- Decision:
  Serve both web and Android from the same Django backend, but split the refresh/logout transport contracts. Web refresh/logout will use cookie-only, CSRF-protected endpoints. Mobile refresh/logout will use explicit token submission and will not depend on browser cookie behavior.
- Alternatives considered:
  Keep one shared refresh/logout endpoint supporting both cookie-based and body-token transport indefinitely.
- Why we chose it:
  The browser and mobile threat models are different. Keeping one endpoint permanently dual-mode increases attack surface, weakens contract clarity, and makes the web security posture harder to reason about. Explicitly split contracts keep the hardened web flow strict while still supporting the Android client cleanly.
- Downsides:
  More endpoints and slightly more client-specific documentation. The backend must maintain two transport contracts over the same core token mechanics.
- Revisit when:
  The product client mix changes enough that one transport model clearly dominates or a gateway/client layer absorbs the distinction.

Current implementation progress:
- the split is no longer just conceptual
- `/api/auth/web/refresh/` is the first dedicated web-only endpoint using cookie transport plus CSRF
- `/api/auth/web/logout/` also follows the dedicated web-only cookie plus CSRF contract
- `/api/auth/mobile/refresh/` and `/api/auth/mobile/logout/` provide the explicit non-browser token-submission contract
- the older generic `/api/auth/refresh/` and `/api/auth/logout/` aliases were removed so route names and transport rules now match

### ADR-013: Use TanStack Router and TanStack Query as the First Frontend App Primitives

- Status: Accepted
- Date: 2026-03-28
- Decision:
  Use TanStack Router for web routing and route state, TanStack Query for server state, plain React state for local UI state, and avoid introducing a general-purpose global client store in the first frontend slice.
- Alternatives considered:
  React Router, Zustand from day one, Redux, or a custom fetch/cache layer.
- Why we chose it:
  The web app is a TypeScript SPA talking to a separate Django API. Most complexity is route-aware UI and API-driven server state, not arbitrary client-only global state. TanStack Router and TanStack Query match that shape directly and reduce custom plumbing.
- Downsides:
  Adds two opinionated libraries up front and requires the team to learn their patterns early.
- Revisit when:
  Client-only shared state grows enough that plain React state and focused context stop being sufficient.

### ADR-014: Use Tailwind CSS, shadcn/ui, and Zod for the Web Frontend; Do Not Use Drizzle

- Status: Accepted
- Date: 2026-03-28
- Decision:
  Use Tailwind CSS for styling, shadcn/ui for editable UI primitives, and Zod for validation. Do not use Drizzle in the frontend.
- Alternatives considered:
  Hand-rolled CSS without a utility framework, a black-box component library, ad hoc form validation, or adding a frontend ORM/database toolkit.
- Why we chose it:
  Tailwind and shadcn/ui speed up app-shell work while keeping the component code editable. Zod fits the TypeScript-first frontend and is useful for form validation and input contracts. Drizzle does not fit the chosen architecture because the frontend talks to the Django API rather than the database directly.
- Downsides:
  Tailwind and shadcn/ui add frontend tooling and convention overhead, and Zod introduces another library to learn.
- Revisit when:
  The frontend architecture changes away from a Django-backed SPA, or the team decides a different design system or validation stack is clearly superior in practice.

### ADR-015: Split Frontend Auth State by Responsibility

- Status: Accepted
- Date: 2026-03-28
- Decision:
  Keep backend-authenticated user data in TanStack Query, route protection and redirect state in TanStack Router, transient form state in plain React state, and the web access token in a small in-memory auth/session layer.
- Alternatives considered:
  Put all auth-related concerns into one global client store, store the access token in query cache, or treat the `me` response as the entire session model.
- Why we chose it:
  The frontend has three distinct state concerns: server state, route state, and local UI state. The web access token is a separate in-memory session concern used to call the Django API. Keeping these responsibilities separate makes the auth flow easier to reason about and avoids creating a global store that mixes unrelated concerns.
- Downsides:
  Auth behavior spans multiple layers instead of living in one store, so the team must understand the boundaries clearly.
- Revisit when:
  The frontend proves it has substantial shared client-only state that justifies a dedicated app-wide state store.

### ADR-016: Use DRF Generic Class-Based Views for Growing API Resources

- Status: Accepted
- Date: 2026-05-18
- Decision:
  Use DRF generic class-based views for API resources that expose standard collection behavior such as list/create, especially when the endpoint needs user-scoped querysets, filtering, pagination, or serializer lifecycle hooks. Keep function-based `@api_view` handlers for very small one-off endpoints where the generic lifecycle adds no value.
- Context:
  The metrics API started with small `@api_view` functions, which were fine for the first metric-definition list endpoint and the first metric-entry create behavior. Once `GET /api/v1/metrics/entries/` and `POST /api/v1/metrics/entries/` lived on the same collection endpoint, the view needed standard list/create behavior, user scoping, ordering, and query parameter filters.
- Alternatives considered:
  Keep `@api_view(["GET", "POST"])` and branch manually on `request.method`; use lower-level `APIView`; or use a `ViewSet`/router from the start.
- Why we chose it:
  `generics.ListAPIView` and `generics.ListCreateAPIView` map directly to the current endpoint shape without extra routing machinery. DRF handles the repetitive create lifecycle internally (`get_serializer`, `is_valid`, `save`, `201` response), while `get_queryset()` gives one clear place for user scoping, ordering, and filters. This keeps the endpoint smaller and prepares it for pagination/filtering without manual method branching.
- Current application:
  `MetricDefinitionListView` uses `generics.ListCreateAPIView`.
  `MetricDefinitionDetailView` uses `generics.RetrieveUpdateAPIView`.
  `MetricEntryListCreateView` uses `generics.ListCreateAPIView`.
  `MetricEntryListCreateView.get_queryset()` scopes entries to `request.user`, orders by `recorded_at DESC, id DESC`, and applies supported query filters such as `metric`, `from`, and `to`.
- Downsides:
  Some behavior becomes implicit in DRF mixins, so developers need to understand that `ListCreateAPIView` already supplies `get()` and `post()` through `ListModelMixin` and `CreateModelMixin`. For unusual endpoint behavior, explicit methods may still be clearer.
- Revisit when:
  The metrics API needs non-standard actions that do not fit generic views, or when route grouping and repeated CRUD patterns justify moving to `ViewSet`/router conventions.

### ADR-017: Use Chart.js Directly for Metric Detail Trend Charts

- Status: Accepted
- Date: 2026-06-02
- Decision:
  Use `chart.js` directly through a canvas-backed React component for metric detail trend charts.
- Alternatives considered:
  Recharts, Visx, and a hand-rolled SVG chart.
- Why we chose it:
  Recharts 3.8.1 repeatedly failed in the Vite dev runtime with optimized-dependency and ESM/CJS interop errors involving transitive packages. Visx was not a clean fit because its published peer dependency range did not include the project's current React 19 version. A hand-rolled SVG chart is possible but would make axes, scale behavior, tooltip behavior, and future chart interactions our responsibility too early. Chart.js works with the current Vite/React setup and gives a standard line-chart foundation without committing to a heavier UI framework.
- Current application:
  `frontend/src/features/metrics/metric-trend-chart.tsx` creates and destroys a Chart.js line chart directly against a canvas. The component registers the required Chart.js controller, scales, elements, and plugins explicitly. The chart is rendered inside `/metrics/$slug`.
- Data behavior:
  The metric detail trend is a daily chart, not a raw event chart. Multiple entries on the same local calendar day are collapsed to the latest `recorded_at` entry for that day. The raw `Entry History` list remains event-level and still shows every manual log.
- Downsides:
  Chart.js adds noticeable weight to the metric-detail route chunk, and canvas rendering needs explicit lifecycle cleanup in React to avoid duplicate-chart errors on reused canvases. The current aggregation rule is intentionally generic and may not fit all future metric types.
- Revisit when:
  The app needs richer analytics, wearable-derived high-frequency data, metric-specific aggregation such as min/max/average bands, or a charting library with better React 19/Vite compatibility becomes clearly preferable.

### ADR-018: Soft-Archive Custom Metric Definitions

- Status: Accepted
- Date: 2026-06-04
- Decision:
  Deactivating a custom metric definition is a soft archive through `is_active=false`, not a hard delete. Historical metric entries remain preserved and readable. Reactivation is supported by PATCHing the user's own custom metric definition back to `is_active=true`.
- Context:
  Users can create custom metrics and log health data against them. Hard-deleting a metric definition would either remove historical health data or leave entries without a clear definition, both of which are poor defaults for a health-tracking product.
- Current application:
  `GET /api/v1/metrics/definitions/` remains active-only by default. `GET /api/v1/metrics/definitions/?include_inactive=true` includes the authenticated user's inactive custom metric definitions for management UI. Inactive defaults and other users' custom metrics remain hidden. `PATCH /api/v1/metrics/definitions/{id}/` can update user-owned custom definitions regardless of active status so archived metrics can be reactivated.
- Frontend implementation:
  `/metrics` now exposes inactive custom definitions behind a `Show deactivated custom metrics` toggle. Archived rows are separated from active metrics, visually muted, marked `Archived`, not linked to `/metrics/$slug`, and can be reactivated in place.
- Consequences:
  Custom metric slugs remain occupied after deactivation, which avoids ambiguity in historical entries. The UI needs an archived custom metrics section rather than mixing inactive metrics into the active logging catalog.
- Revisit when:
  The product needs account-level data export/delete workflows, custom metric merge/rename tooling, or subscription rules that limit active versus archived custom metrics differently.
