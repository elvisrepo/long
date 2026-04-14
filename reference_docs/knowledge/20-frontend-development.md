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

Current limitation:
- `/settings` is still only a route placeholder and is not yet protected by auth

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

Immediate next frontend step from this checkpoint:
- keep the current route skeleton
- replace placeholder page bodies with auth-aware UI
- add a small API client and in-memory session layer
- wire `/login` and `/register` to the backend auth endpoints
- protect authenticated routes such as `/settings` once `me` and session state are available

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
