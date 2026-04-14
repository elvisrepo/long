import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  component: DashboardRoute,
});

function DashboardRoute() {
  return (
    <section>
      <h1>Dashboard</h1>
      <p>Dashboard metrics and trends will live here.</p>
    </section>
  );
}
