import { createFileRoute } from "@tanstack/react-router";
import { useState } from 'react'

import { loginWeb } from '../features/auth/auth-api'
import { LoginForm } from "../features/auth/login-form";

 interface LoginValues {
    email: string
    password: string
  }

export const Route = createFileRoute("/login")({
  component: LoginRoute,
});




function LoginRoute() {
    const [errorMessage, setErrorMessage] = useState('')
    const [isSubmitting, setIsSubmitting] = useState(false)

    async function handleLogin(values: LoginValues) {
      try {
        setErrorMessage('')
        setIsSubmitting(true)
        await loginWeb(values)
      } catch (error) {
        if (error instanceof Error) {
          setErrorMessage(error.message)
          return
        }

        setErrorMessage('Login failed')
      }
    }

    return (
      <section>
        <h1>Login</h1>
        {errorMessage ? <p>{errorMessage}</p> : null}
        <LoginForm onSubmit={handleLogin} disabled={isSubmitting} />
      </section>
    )
  }