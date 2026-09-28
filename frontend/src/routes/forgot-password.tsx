import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";

import { requestPasswordReset } from "../features/auth/password-reset-api";

export const Route = createFileRoute("/forgot-password")({
  component: ForgotPasswordRoute,
});

function ForgotPasswordRoute() {
  const [email, setEmail] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [requestComplete, setRequestComplete] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit() {
    try {
      setErrorMessage("");
      setIsSubmitting(true);
      await requestPasswordReset(email.trim());
      setRequestComplete(true);
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Password reset request failed",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="auth-panel" aria-labelledby="forgot-password-title">
      <Link to="/" className="auth-logo">
        ⬡ longevity
      </Link>
      <p className="auth-eyebrow">Account recovery</p>
      <h1 id="forgot-password-title">Forgot password</h1>
      <p className="auth-intro">
        Enter your email and we will send a reset link if the account exists.
      </p>
      {requestComplete ? (
        <p role="status">
          Check your email. If an account exists, a reset link has been sent.
        </p>
      ) : (
        <form
          className="auth-form"
          onSubmit={(event) => {
            event.preventDefault();
            void handleSubmit();
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
          {errorMessage ? (
            <p className="auth-error" role="alert">
              {errorMessage}
            </p>
          ) : null}
          <button type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Sending..." : "Send reset link"}
          </button>
        </form>
      )}
      <p className="auth-footer">
        <Link to="/login">Back to login →</Link>
      </p>
    </section>
  );
}
