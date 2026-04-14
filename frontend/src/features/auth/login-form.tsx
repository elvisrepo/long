import { useState } from "react";

interface LoginFormValues {
  email: string;
  password: string;
}

interface LoginFormProps {
  onSubmit: (values: LoginFormValues) => void;
}

export function LoginForm({ onSubmit }: LoginFormProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState('')

  function handleSubmit(event: { preventDefault: () => void }) {
    event.preventDefault();
    const trimmedEmail = email.trim();

    if (!trimmedEmail || !password) {
        setErrorMessage('Email and password are required.')
      return;
    }

     setErrorMessage('')

    onSubmit({
      email: trimmedEmail,
      password,
    });
  }

  function handleEmailChange(value: string) {
      setEmail(value)
      setErrorMessage('')
    }

    function handlePasswordChange(value: string) {
      setPassword(value)
      setErrorMessage('')
    }

  return (
    <form onSubmit={handleSubmit}>
      <label htmlFor="email">Email</label>
      <input
        id="email"
        name="email"
        type="email"
        value={email}
        onChange={(event) => handleEmailChange(event.target.value)}
      />

      <label htmlFor="password">Password</label>
      <input
        id="password"
        name="password"
        type="password"
        value={password}
        onChange={(event) => handlePasswordChange(event.target.value)}
      />

      {errorMessage ? <p>{errorMessage}</p> : null}

      <button type="submit">Login</button>
    </form>
  );
}
