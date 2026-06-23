import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { logoutWeb } from '../features/auth/auth-logout-api'
import { requireAuthBeforeLoad } from '../features/auth/require-auth-before-load'
import { useMeQuery } from '../features/auth/use-me-query'
import { redirectToCheckout } from '../features/subscriptions/checkout-redirect'
import { useCreateSubscriptionCheckoutMutation } from '../features/subscriptions/use-create-subscription-checkout-mutation'
import { useCurrentSubscriptionQuery } from '../features/subscriptions/use-current-subscription-query'
import { useSubscriptionPlansQuery } from '../features/subscriptions/use-subscription-plans-query'

export const Route = createFileRoute('/settings')({
  beforeLoad: requireAuthBeforeLoad,
  component: SettingsRoute,
})

function SettingsRoute() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const meQuery = useMeQuery()
  const currentSubscriptionQuery = useCurrentSubscriptionQuery()
  const subscriptionPlansQuery = useSubscriptionPlansQuery()
  const checkoutMutation = useCreateSubscriptionCheckoutMutation()
  const [errorMessage, setErrorMessage] = useState('')
  const [isLoggingOut, setIsLoggingOut] = useState(false)

  const paidPlans =
    subscriptionPlansQuery.data?.filter(
      (plan) => !plan.is_default && plan.prices.length > 0,
    ) ?? []

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

  async function handleCheckout(priceId: string) {
    try {
      setErrorMessage('')
      const checkout = await checkoutMutation.mutateAsync({ priceId })
      redirectToCheckout(checkout.url)
    } catch (error) {
      if (error instanceof Error) {
        setErrorMessage(error.message)
        return
      }

      setErrorMessage('Checkout failed to start')
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

      <section aria-label="Available plans">
        <h2>Available Plans</h2>
        {subscriptionPlansQuery.isPending ? (
          <p>Loading available plans...</p>
        ) : null}
        {subscriptionPlansQuery.isError ? (
          <p>Available plans failed to load.</p>
        ) : null}
        {paidPlans.map((plan) => (
          <article key={plan.code}>
            <h3>{plan.name}</h3>
            <p>{plan.active_custom_metric_limit} custom metrics</p>
            <p>Sync every {plan.sync_interval_minutes} minutes</p>
            <ul>
              {plan.prices.map((price) => (
                <li key={price.id}>
                  {formatSubscriptionPrice(price.unit_amount, price.currency)} /{' '}
                  {price.billing_interval}
                  <button
                    type="button"
                    disabled={checkoutMutation.isPending}
                    onClick={() => void handleCheckout(price.id)}
                  >
                    Upgrade to {plan.name} {price.billing_interval}ly
                  </button>
                </li>
              ))}
            </ul>
          </article>
        ))}
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

function formatSubscriptionPrice(unitAmount: number, currency: string) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
  }).format(unitAmount / 100)
}
