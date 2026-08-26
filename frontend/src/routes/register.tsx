import { createFileRoute, useNavigate } from "@tanstack/react-router";
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
    <section>
      <h1>Register</h1>
      {errorMessage ? <p>{errorMessage}</p> : null}
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void handleRegister({ email, password });
        }}
      >
        <label htmlFor="email">Email</label>
        <input
          id="email"
          name="email"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />

        <label htmlFor="password">Password</label>
        <input
          id="password"
          name="password"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />

        <button type="submit" disabled={isSubmitting}>
          Register
        </button>
      </form>
    </section>
  );
}
