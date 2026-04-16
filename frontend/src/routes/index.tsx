import { Navigate, createFileRoute } from "@tanstack/react-router";

import { useMeQuery } from "../features/auth/use-me-query";

export const Route = createFileRoute("/")({
  component: DashboardRoute,
});

function DashboardRoute() {

  const meQuery = useMeQuery()

  if (meQuery.isLoading) {
      return <p>Loading...</p>
    }

    if (meQuery.isError || !meQuery.data) {
      return <Navigate to="/login" />
    }

    return (
      <section>
        <h1>Dashboard</h1>
        <p>Dashboard metrics and trends will live here.</p>
      </section>
    )
}
