import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";

import { confirmPasswordReset } from "../features/auth/password-reset-api";

interface ResetPasswordSearch {
  uid?: string;
  token?: string;
}

export const Route = createFileRoute("/reset-password")({
  validateSearch: (search: Record<string, unknown>): ResetPasswordSearch => ({
    uid: typeof search.uid === "string" ? search.uid : undefined,
    token: typeof search.token === "string" ? search.token : undefined,
  }),
  component: ResetPasswordRoute,
});

function ResetPasswordRoute() {
  const { uid, token } = Route.useSearch();
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [resetComplete, setResetComplete] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const hasValidLink = Boolean(uid && token);

  async function handleSubmit() {
    if (newPassword !== confirmPassword) {
      setErrorMessage("Passwords do not match.");
      return;
    }

    try {
      setErrorMessage("");
      setIsSubmitting(true);
      await confirmPasswordReset({
        uid: uid!,
        token: token!,
        newPassword,
      });
      setResetComplete(true);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Password reset failed",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="auth-panel" aria-labelledby="reset-password-title">
      <Link to="/" className="auth-logo">
        ⬡ longevity
      </Link>
      <p className="auth-eyebrow">Account recovery</p>
      <h1 id="reset-password-title">Reset password</h1>

      {!hasValidLink ? (
        <>
          <p className="auth-error" role="alert">
            This reset link is incomplete. Request a new one.
          </p>
          <p className="auth-footer">
            <Link to="/forgot-password">Request another link →</Link>
          </p>
        </>
      ) : resetComplete ? (
        <>
          <p role="status">Your password has been reset successfully.</p>
          <p className="auth-footer">
            <Link to="/login">Continue to login →</Link>
          </p>
        </>
      ) : (
        <>
          <p className="auth-intro">Choose a new password for your account.</p>
          <form
            className="auth-form"
            onSubmit={(event) => {
              event.preventDefault();
              void handleSubmit();
            }}
          >
            <label htmlFor="new-password">New password</label>
            <input
              aria-describedby="password-guidance"
              autoComplete="new-password"
              id="new-password"
              minLength={8}
              name="new-password"
              type="password"
              required
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
            />

            <label htmlFor="confirm-password">Confirm new password</label>
            <input
              autoComplete="new-password"
              id="confirm-password"
              minLength={8}
              name="confirm-password"
              type="password"
              required
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
            />

            <p className="auth-hint" id="password-guidance">
              Use at least 8 characters. Avoid common or entirely numeric
              passwords.
            </p>
            {errorMessage ? (
              <p className="auth-error" role="alert">
                {errorMessage}
              </p>
            ) : null}
            <button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Resetting..." : "Reset password"}
            </button>
          </form>
        </>
      )}
    </section>
  );
}
