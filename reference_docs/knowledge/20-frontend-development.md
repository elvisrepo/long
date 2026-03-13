## 5. Frontend Development (Parallel from R1)

## Use When
- Load this when you need the planned frontend stack, component direction, routes, API integration approach, state management, or responsive behavior.

## Source
- Derived from `reference_docs/knowledge/planning.md` section 5.

### 5.1 Clients
- Web dashboard: React (Vite)
- Samsung-sync companion app: Kotlin Android app (R2/R3)
### 5.2 Component Library
- Metric Cards (glassmorphic, colored left border)
- Charts (Recharts — area charts with gradient fills)
- Form inputs (metric logging modal)
- Navigation (side nav desktop, bottom tabs mobile)
- Samsung sync status cards, permission prompts, and replay/error states

### 5.3 Routing: React Router
- `/` → Dashboard
- `/metrics/:slug` → Metric detail
- `/settings` → Profile, Samsung sync status, subscription
- `/login`, `/register` → Auth pages

### 5.4 API Integration
- Web: Axios / fetch + JWT interceptor for auto-refresh
- Android: same REST API with JWT auth plus idempotent upload endpoints for sync batches

### 5.5 State Management
- Web: Zustand (simpler than Redux for this scale)
- Android: native local sync state + background work coordination

### 5.6 Responsive
- Web: mobile-first CSS, 4-col → 2-col → 1-col grid
- Sync itself is Android-only in MVP; the web app surfaces status and synced data after upload
