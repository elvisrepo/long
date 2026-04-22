import { createFileRoute, redirect } from '@tanstack/react-router'
import { getMe } from '../features/auth/auth-me-api'

export const Route = createFileRoute('/')({
    beforeLoad: async ({ context }) => {
      try {
        await context.queryClient.ensureQueryData({
          queryKey: ['me'],
          queryFn: getMe,
        })
      } catch {
        throw redirect({ to: '/login' })
      }
    },
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
