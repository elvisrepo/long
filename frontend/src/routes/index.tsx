import { createFileRoute } from '@tanstack/react-router'

import { RequireAuth } from '../features/auth/require-auth'

export const Route = createFileRoute('/')({
  component: DashboardRoute,
})

function DashboardRoute() {
  return (
    <RequireAuth>
      {() => (
      <section>
        <h1>Dashboard</h1>
        <p>Dashboard metrics and trends will live here.</p>
      </section>
      )}
    </RequireAuth>
  )
}
