import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { logoutWeb } from '../features/auth/auth-logout-api'
import { requireAuthBeforeLoad } from '../features/auth/require-auth-before-load'
import { useMeQuery } from '../features/auth/use-me-query'
import { useCurrentSubscriptionQuery } from '../features/subscriptions/use-current-subscription-query'

export const Route = createFileRoute('/settings')({
  beforeLoad: requireAuthBeforeLoad,
  component: SettingsRoute,
})

function SettingsRoute() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const meQuery = useMeQuery()
  const currentSubscriptionQuery = useCurrentSubscriptionQuery()
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

      <section aria-label="Current subscription">
        <h2>Current Plan</h2>
        {currentSubscriptionQuery.isPending ? (
          <p>Loading current plan...</p>
        ) : null}
        {currentSubscriptionQuery.isError ? (
          <p>Current plan failed to load.</p>
        ) : null}
        {currentSubscriptionQuery.data ? (
          <div>
            <h3>{currentSubscriptionQuery.data.plan.name}</h3>
            <p>
              {
                currentSubscriptionQuery.data.plan
                  .active_custom_metric_limit
              }{' '}
              custom metrics
            </p>
            <p>
              Sync every{' '}
              {currentSubscriptionQuery.data.plan.sync_interval_minutes}{' '}
              minutes
            </p>
          </div>
        ) : null}
      </section>

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
