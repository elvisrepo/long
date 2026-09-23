import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";

import { registerWeb } from "../features/auth/register-api";

interface RegisterValues {
  email: string;
  password: string;
}

export const Route = createFileRoute("/register")({
  component: RegisterRoute,
});

function RegisterRoute() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleRegister(values: RegisterValues) {
    try {
      setErrorMessage("");
      setIsSubmitting(true);
      await registerWeb(values);
      await navigate({ to: "/login" });
    } catch (error) {
      if (error instanceof Error) {
        setErrorMessage(error.message);
        return;
      }

      setErrorMessage("Registration failed");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="auth-panel" aria-labelledby="register-title">
      <Link to="/" className="auth-logo">
        ⬡ longevity
      </Link>
      <p className="auth-eyebrow">Create account</p>
      <h1 id="register-title">Register</h1>
      <p className="auth-intro">
        Create your account to start tracking health metrics over time.
      </p>
      {errorMessage ? (
        <p className="auth-error" role="alert">
          {errorMessage}
        </p>
      ) : null}
      <form
        className="auth-form"
        onSubmit={(event) => {
          event.preventDefault();
          void handleRegister({ email, password });
        }}
      >
        <label htmlFor="email">Email</label>
        <input
          autoComplete="email"
          id="email"
          name="email"
          type="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />

        <label htmlFor="password">Password</label>
        <input
          aria-describedby="password-guidance"
          autoComplete="new-password"
          id="password"
          minLength={8}
          name="password"
          type="password"
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />

        <p className="auth-hint" id="password-guidance">
          Use at least 8 characters. Avoid common or entirely numeric passwords.
        </p>

        <button type="submit" disabled={isSubmitting}>
          Register
        </button>
      </form>
      <p className="auth-footer">
        Have an account? <Link to="/login">Login →</Link>
      </p>
    </section>
  );
}
