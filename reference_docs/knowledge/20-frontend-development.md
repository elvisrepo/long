## 5. Frontend Development (Parallel from R1)

## Use When
- Load this when you need the planned frontend stack, component direction, routes, API integration approach, state management, or responsive behavior.

## Source
- Derived from `reference_docs/knowledge/planning.md` section 5.

### 5.1 Clients
- Web dashboard: React (Vite + TypeScript)
- Samsung-sync companion app: Kotlin Android app (R2/R3)
### 5.2 Component Library
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

### 5.5 State Management
- Web:
  - `TanStack Query` for server state
  - minimal client state for auth/session UI and local interaction state
  - add Zustand only if a real client-state need appears beyond server-state concerns
- Android: native local sync state + background work coordination

### 5.6 Responsive
- Web: mobile-first CSS, 4-col → 2-col → 1-col grid
- Sync itself is Android-only in MVP; the web app surfaces status and synced data after upload

### 5.7 Tooling
- Build tool: `Vite`
- Language: `TypeScript`
- Linting: `ESLint`
- Formatting: `Prettier`
- Testing later:
  - `Vitest`
  - `React Testing Library`
  - `MSW`
  - `Playwright` for end-to-end

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
