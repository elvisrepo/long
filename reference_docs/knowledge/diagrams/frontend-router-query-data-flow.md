# Frontend Router and Query Data Flow

## Use When
- Load this when you need to reason about TanStack Router versus TanStack Query responsibilities in the React frontend.
- Load this when working on protected routes, dynamic route params, query hooks, mutations, cache invalidation, or frontend server-state flow.

## Current Rule
- TanStack Router owns navigation, route params, route protection, and redirect flow.
- TanStack Query owns frontend server state, cached API data, mutation state, refetching, and invalidation.
- The access token is not stored in TanStack Query; the auth/session layer owns the in-memory token.

## Diagram

```mermaid
flowchart TD
  User[User in Browser]

  subgraph Browser["Frontend Runtime: Browser"]
    Router[TanStack Router]
    Routes[Route Components]

    subgraph RouteFiles["Route Files"]
      Dashboard["/ routes/index.tsx<br/>Dashboard"]
      Metrics["/metrics routes/metrics.tsx<br/>Metrics Catalog"]
      MetricDetail["/metrics/$slug routes/metrics.$slug.tsx<br/>Metric Detail"]
      Settings["/settings route"]
    end

    AuthGuard["requireAuthBeforeLoad<br/>Router auth guard"]
    Params["Route Params<br/>Route.useParams()<br/>slug = resting_hr"]

    subgraph QueryLayer["TanStack Query Layer"]
      QueryClient["QueryClient<br/>owns frontend server-state cache"]
      QueryCache["In-memory Query Cache<br/>lives in browser memory"]
      Queries["Query Hooks<br/>useMeQuery<br/>useMetricDefinitionsQuery<br/>useMetricEntriesQuery"]
      Mutations["Mutation Hooks<br/>useCreateMetricEntryMutation<br/>useCreateMetricDefinitionMutation"]
      Invalidation["Cache Invalidation<br/>invalidate metric queries after writes"]
    end

    ApiFns["API Functions<br/>fetch wrappers<br/>metric-definitions-api.ts<br/>metric-entries-api.ts"]
  end

  subgraph Backend["Django Backend"]
    AuthApi["Auth API<br/>/api/auth/*"]
    MetricsDefinitionsApi["Metric Definitions API<br/>/api/v1/metrics/definitions/"]
    MetricsEntriesApi["Metric Entries API<br/>/api/v1/metrics/entries/"]
  end

  subgraph Database["PostgreSQL"]
    Users[(users)]
    MetricDefinitions[(metric definitions)]
    MetricEntries[(metric entries)]
  end

  User --> Router
  Router --> AuthGuard
  Router --> Dashboard
  Router --> Metrics
  Router --> MetricDetail
  Router --> Settings

  MetricDetail --> Params

  Dashboard --> Queries
  Metrics --> Queries
  MetricDetail --> Queries
  Settings --> Queries

  Dashboard --> Mutations
  Metrics --> Mutations

  Queries --> QueryClient
  Mutations --> QueryClient
  QueryClient --> QueryCache

  Queries --> ApiFns
  Mutations --> ApiFns

  Mutations --> Invalidation
  Invalidation --> QueryClient
  QueryClient --> Queries

  ApiFns --> AuthApi
  ApiFns --> MetricsDefinitionsApi
  ApiFns --> MetricsEntriesApi

  AuthApi --> Users
  MetricsDefinitionsApi --> MetricDefinitions
  MetricsEntriesApi --> MetricEntries
  MetricsEntriesApi --> MetricDefinitions
```

## Current Implementation Notes
- Protected routes use `beforeLoad: requireAuthBeforeLoad`.
- `requireAuthBeforeLoad` uses the router context `QueryClient` to ensure the current user query can resolve before protected content renders.
- Metrics data is currently fetched inside route components through TanStack Query hooks, not through route loaders.
- The `/metrics/$slug` route reads the dynamic `slug` URL param with `Route.useParams()`.
- Route loaders are not currently used for metric data preloading. If needed later, the preferred direction is to use loaders to warm or ensure TanStack Query cache entries, not to create a second independent data cache.
