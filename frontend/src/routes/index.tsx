import { createFileRoute } from '@tanstack/react-router'
import { requireAuthBeforeLoad } from '../features/auth/require-auth-before-load'

export const Route = createFileRoute('/')({
    beforeLoad: requireAuthBeforeLoad,
    component: DashboardRoute,
  })

function DashboardRoute() {
  return (
    <section>
        <h1>Dashboard</h1>
        <p>Dashboard metrics and trends will live here.</p>
      </section>
  )
}
