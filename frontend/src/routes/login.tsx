import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/login')({
  component: LoginRoute,
})

function LoginRoute() {
  return (
    <section>
      <h1>Login</h1>
      <p>Web login form goes here.</p>
    </section>
  )
}
