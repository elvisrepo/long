import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";

import { loginWeb } from "../features/auth/auth-api";
import { LoginForm } from "../features/auth/login-form";

import { setAccessToken } from "../features/auth/auth-session";

interface LoginValues {
  email: string;
  password: string;
}

export const Route = createFileRoute("/login")({
  component: LoginRoute,
});

function LoginRoute() {
  const navigate = useNavigate();
  const [errorMessage, setErrorMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleLogin(values: LoginValues) {
    try {
      setErrorMessage("");
      setIsSubmitting(true);
      const result = await loginWeb(values);
      setAccessToken(result.access);
      await navigate({ to: "/" });
    } catch (error) {
      if (error instanceof Error) {
        setErrorMessage(error.message);
        return;
      }

      setErrorMessage("Login failed");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section>
      <h1>Login</h1>
      {errorMessage ? <p>{errorMessage}</p> : null}
      <LoginForm onSubmit={handleLogin} disabled={isSubmitting} />
    </section>
  );
}
