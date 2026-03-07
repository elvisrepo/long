## 5. Frontend Development (Parallel from R1)

## Use When
- Load this when you need the planned frontend stack, component direction, routes, API integration approach, state management, or responsive behavior.

## Source
- Derived from `reference_docs/knowledge/planning.md` section 5.

### 5.1 Framework: React (Vite)
### 5.2 Component Library
- Metric Cards (glassmorphic, colored left border)
- Charts (Recharts — area charts with gradient fills)
- Form inputs (metric logging modal)
- Navigation (side nav desktop, bottom tabs mobile)

### 5.3 Routing: React Router
- `/` → Dashboard
- `/metrics/:slug` → Metric detail
- `/settings` → Profile, wearable connections, subscription
- `/login`, `/register` → Auth pages

### 5.4 API Integration: Axios / fetch + JWT interceptor for auto-refresh

### 5.5 State Management: Zustand (simpler than Redux for this scale)

### 5.6 Responsive: Mobile-first CSS, 4-col → 2-col → 1-col grid
