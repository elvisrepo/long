import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { requireAuthBeforeLoad } from '../features/auth/require-auth-before-load'

import { logoutWeb } from '../features/auth/auth-logout-api'
import { useMeQuery } from '../features/auth/use-me-query'

export const Route = createFileRoute('/settings')({
    beforeLoad: requireAuthBeforeLoad,
    component: SettingsRoute,
  })

  function SettingsRoute() {
    const navigate = useNavigate()
    const queryClient = useQueryClient()
    const meQuery = useMeQuery()
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

    if (!meQuery.data) {
      return <p>Loading...</p>
    }

    return (
      <section>
        <h1>Settings</h1>
        <p>Signed in as {meQuery.data.email}</p>
        {errorMessage ? <p>{errorMessage}</p> : null}
        <button
          type="button"
          disabled={isLoggingOut}
          onClick={() => void handleLogout()}
        >
          Logout
        </button>
      </section>
    )

  }