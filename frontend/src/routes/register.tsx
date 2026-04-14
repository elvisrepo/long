import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/register")({
  component: RegisterRoute,
});

function RegisterRoute() {
  return (
    <section>
      <h1>Register</h1>
      <p>Account creation form goes here.</p>
    </section>
  );
}
