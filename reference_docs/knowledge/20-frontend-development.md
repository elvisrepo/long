## 5. Frontend Development (Parallel from R1)

## Use When
- Load this when you need the planned frontend stack, component direction, routes, API integration approach, state management, or responsive behavior.

## Source
- Derived from `reference_docs/knowledge/planning.md` section 5.

### 5.1 Clients
- Web dashboard: React (Vite + TypeScript)
- Samsung-sync companion app: Kotlin Android app (R2/R3)
### 5.2 Component Library
- UI primitives: `shadcn/ui`
- Metric Cards (glassmorphic, colored left border)
- Charts (Recharts — area charts with gradient fills)
- Form inputs (metric logging modal)
- Navigation (side nav desktop, bottom tabs mobile)
- Samsung sync status cards, permission prompts, and replay/error states

### 5.3 Routing: TanStack Router
- Use `TanStack Router` for the web app routing layer.
- Prefer route-based layouts and protected routes for the auth shell.
- Use route-level lazy loading/code splitting for heavier pages.
- `/` → Dashboard
- `/metrics/:slug` → Metric detail
- `/settings` → Profile, Samsung sync status, subscription
- `/login`, `/register` → Auth pages

Current frontend routing checkpoint:
- the Vite plugin-based TanStack Router setup is now in place
- `src/main.tsx` bootstraps React and renders `RouterProvider`
- `src/routes/__root.tsx` provides the current top-level layout shell
- the route skeleton currently includes:
  - `/`
  - `/login`
  - `/register`
  - `/settings`
- `src/routeTree.gen.ts` is generated from the file-based route modules and should not be edited by hand
- production builds are already code-splitting these route files into separate chunks

Current routing/auth checkpoint:
- `/` is now treated as an authenticated dashboard route
- `/settings` is also protected by the same current-user query pattern
- protected-route behavior is still duplicated route by route and has not yet been extracted into a shared auth guard/layout

### 5.4 API Integration
- Web: central API client + `TanStack Query` for server state, caching, retries, and invalidation
- Avoid scattering raw `fetch()` calls across components
- Prefer query hooks and targeted mutations around the backend API contract
- Android: same REST API with JWT auth plus idempotent upload endpoints for sync batches

Current build order:
- web frontend comes before the Android companion app
- the first frontend slice should connect to the already-implemented web auth backend
- manual metric entry and dashboard reads should be implemented on web before Health Connect sync work begins

First web slice:
- `GET /api/auth/csrf/`
- `POST /api/auth/web/login/`
- `POST /api/auth/web/refresh/`
- `POST /api/auth/web/logout/`
- `GET /api/auth/me/`
- access token kept in memory on web
- invalidate or refetch `me` after login, logout, and refresh transitions where needed

Role of `GET /api/auth/me/` on the frontend:
- the access token is only the client-held credential
- `GET /api/auth/me/` is the backend-confirmed source of truth for the current authenticated user
- the frontend should not treat "we have a token string" as the same thing as "we know who the user is"
- `me` is what the frontend should use to:
  - confirm the stored token is still valid
  - know which user is currently authenticated
  - populate authenticated UI such as current user email
  - drive protected-route decisions
  - recover cleanly from invalid or expired auth state by clearing session when `me` fails

Practical auth model:
- access token in memory = credential for authenticated requests
- `GET /api/auth/me/` = current-user identity/resource fetched from the backend
- TanStack Query should own the cached `me` result
- the auth/session layer should own the access token itself

How the backend `me` endpoint authenticates in the current implementation:
- DRF runs authentication before `me_view` executes
- the project currently uses `rest_framework_simplejwt.authentication.JWTAuthentication` as the default DRF authentication class
- the frontend must therefore send `Authorization: Bearer <access-token>` when calling `GET /api/auth/me/`
- SimpleJWT validates the token and resolves the user
- `me_view` itself does not verify the JWT directly; it checks the already-populated `request.user`
- if `request.user.is_authenticated` is false, the endpoint returns `401`
- if authentication succeeded, the endpoint returns the current user payload, currently just:
  - `email`

Current frontend `me` helper checkpoint:
- the frontend now has a `getMe()` helper that:
  - reads the in-memory access token
  - calls `/api/auth/me/` with `Authorization: Bearer <token>`
  - throws if the token is missing
  - preserves backend auth `detail` when available
  - falls back to a generic current-user error when detail is unavailable

Current authenticated-user Query checkpoint:
- the frontend now has a `useMeQuery()` hook backed by TanStack Query
- `useMeQuery()` is the first frontend boundary that exposes current-user server state to routed UI
- this is the intended direction for authenticated UI:
  - session layer owns the access token
  - `getMe()` owns the HTTP contract
  - TanStack Query owns the cached current-user resource

Immediate next frontend step from this checkpoint:
- keep the current route skeleton
- replace placeholder page bodies with auth-aware UI
- add a small API client and in-memory session layer
- wire `/login` and `/register` to the backend auth endpoints
- protect authenticated routes such as `/settings` once `me` and session state are available

Current login-route checkpoint:
- `/login` now uses the reusable `LoginForm`
- the route calls the frontend `loginWeb(...)` helper on submit
- route-level auth failures are displayed on the page
- the login button is disabled while the async login request is in progress
- successful login stores the returned access token in the current in-memory session layer
- successful login currently redirects to `/`

Current protected-route checkpoint:
- after login, the frontend stores the returned access token in memory
- `getMe()` uses that bearer token to call `GET /api/auth/me/`
- `useMeQuery()` exposes the current authenticated user resource, currently including `email`
- a logged-in user can render the protected dashboard route at `/`
- unauthenticated or errored current-user state redirects protected routes to `/login`

Current limitation:
- authenticated user bootstrap is still route-local rather than app-wide
- protected-route behavior currently exists on both `/` and `/settings`, but is not yet abstracted into a shared auth guard/layout

### 5.5 State Management
- Web:
  - `TanStack Query` for server state
  - `TanStack Router` for route state
  - plain React state for local UI state
  - React context only for small cross-cutting app concerns if needed
  - add Zustand only if a real client-state need appears beyond server-state and route-state concerns
- Android: native local sync state + background work coordination

Working rule:
- do not introduce a general-purpose global client store unless the app proves it needs one
- most current complexity belongs either to server state or route state, not a separate app-wide store

Auth/session split for the web app:
- `TanStack Query` owns backend-authenticated user state such as `GET /api/auth/me/`
- `TanStack Router` owns route protection and redirect flow
- plain React state owns form inputs and transient auth UI state
- a small auth/session layer owns the in-memory access token and auth actions such as login, refresh, and logout

Do not:
- store the access token inside query cache
- pretend the cached `me` object is the same thing as the access token/session state
- introduce a large global auth store before the app proves it needs one

### 5.6 Responsive
- Web: mobile-first CSS, 4-col → 2-col → 1-col grid
- Sync itself is Android-only in MVP; the web app surfaces status and synced data after upload

### 5.7 Tooling
- Build tool: `Vite`
- Language: `TypeScript`
- Validation: `Zod`
- Styling: `Tailwind CSS`
- Linting: `ESLint`
- Formatting: `Prettier`
- Testing later:
  - `Vitest`
  - `React Testing Library`
  - `MSW`
  - `Playwright` for end-to-end

Current frontend formatting checkpoint:
- `Prettier` is now installed in the frontend toolchain
- `package.json` now includes:
  - `format`
  - `format:check`
- `.prettierignore` excludes:
  - `dist`
  - `node_modules`
  - `src/routeTree.gen.ts`

Working rule:
- use ESLint for correctness-oriented linting
- use Prettier for code formatting
- do not hand-edit formatting in generated files such as `src/routeTree.gen.ts`

### 5.8 Code Splitting and Performance
- Do route-level code splitting from the start.
- Split heavier routes such as:
  - dashboard
  - settings
  - future metric detail pages
- Do not over-split tiny shared components.
- Reason:
  - reduce initial bundle size
  - keep auth pages and first load lighter
  - avoid unnecessary client-side waterfalls by coordinating route loading and data fetching carefully

### 5.9 React Compiler
- Do not make React Compiler part of the first frontend slice.
- Revisit it after the auth shell is working and the base frontend architecture is stable.

### 5.10 Deliberate Non-Choices
- Do not use `Drizzle` in the web frontend.
- Reason:
  - the frontend talks to the Django API, not directly to the database
  - `Drizzle` solves a different architecture problem
