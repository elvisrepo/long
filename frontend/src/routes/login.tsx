import { createFileRoute } from "@tanstack/react-router";

import { LoginForm } from "../features/auth/login-form";

export const Route = createFileRoute("/login")({
  component: LoginRoute,
});

function LoginRoute() {
  return (
    <section>
      <h1>Login</h1>
      <LoginForm onSubmit={() => {}} />
    </section>
  );
}
