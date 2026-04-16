import { Navigate, createFileRoute } from '@tanstack/react-router'

  import { useMeQuery } from '../features/auth/use-me-query'

  export const Route = createFileRoute('/settings')({
    component: SettingsRoute,
  })

  function SettingsRoute() {
    const meQuery = useMeQuery()

    if (meQuery.isLoading) {
      return <p>Loading...</p>
    }

    if (meQuery.isError || !meQuery.data) {
      return <Navigate to="/login" />
    }

    return (
      <section>
        <h1>Settings</h1>
        <p>Signed in as {meQuery.data.email}</p>
      </section>
    )
  }