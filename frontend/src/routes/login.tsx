import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
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
    <section className="auth-panel" aria-labelledby="login-title">
      <Link to="/" className="auth-logo">
        ⬡ longevity
      </Link>
      <p className="auth-eyebrow">Welcome back</p>
      <h1 id="login-title">Login</h1>
      <p className="auth-intro">
        Sign in to review your health metrics and latest trends.
      </p>
      {errorMessage ? (
        <p className="auth-error" role="alert">
          {errorMessage}
        </p>
      ) : null}
      <LoginForm onSubmit={handleLogin} disabled={isSubmitting} />
      <p className="auth-footer">
        No account? <Link to="/register">Create an account →</Link>
      </p>
    </section>
  );
}
