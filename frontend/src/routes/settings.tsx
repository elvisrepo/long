import { createFileRoute } from '@tanstack/react-router'

import { RequireAuth } from '../features/auth/require-auth'

export const Route = createFileRoute('/settings')({
  component: SettingsRoute,
})

function SettingsRoute() {
  return (
    <RequireAuth>
      {(currentUser) => (
      <section>
        <h1>Settings</h1>
        <p>Signed in as {currentUser.email}</p>
      </section>
      )}
    </RequireAuth>
  )
}
