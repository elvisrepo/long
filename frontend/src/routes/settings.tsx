import { useState } from 'react'
  import { useQueryClient } from '@tanstack/react-query'
  import { createFileRoute, useNavigate } from '@tanstack/react-router'

  import { logoutWeb } from '../features/auth/auth-logout-api'
  import { RequireAuth } from '../features/auth/require-auth'

  export const Route = createFileRoute('/settings')({
    component: SettingsRoute,
  })

  function SettingsRoute() {
    const navigate = useNavigate()
    const queryClient = useQueryClient()
    const [errorMessage, setErrorMessage] = useState('')
    const [isLoggingOut, setIsLoggingOut] = useState(false)

    async function handleLogout() {
      try {
        setErrorMessage('')
        setIsLoggingOut(true)
        await logoutWeb()
        queryClient.removeQueries({ queryKey: ['me'] })
        await navigate({ to: '/login' })
      } catch (error) {
        if (error instanceof Error) {
          setErrorMessage(error.message)
          return
        }

        setErrorMessage('Logout failed')
      } finally {
        setIsLoggingOut(false)
      }
    }

    return (
      <RequireAuth>
        {(currentUser) => (
          <section>
            <h1>Settings</h1>
            <p>Signed in as {currentUser.email}</p>
            {errorMessage ? <p>{errorMessage}</p> : null}
            <button type="button" disabled={isLoggingOut} onClick={() => void handleLogout()}>
              Logout
            </button>
          </section>
        )}
      </RequireAuth>
    )

  }