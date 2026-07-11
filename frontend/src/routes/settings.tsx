import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import {
  createFileRoute,
  useNavigate,
  useRouterState,
} from '@tanstack/react-router'
import { logoutWeb } from '../features/auth/auth-logout-api'
import { requireAuthBeforeLoad } from '../features/auth/require-auth-before-load'
import { useMeQuery } from '../features/auth/use-me-query'
import { redirectToCheckout } from '../features/subscriptions/checkout-redirect'
import { redirectToPortal } from '../features/subscriptions/portal-redirect'
import { useCreateSubscriptionCheckoutMutation } from '../features/subscriptions/use-create-subscription-checkout-mutation'
import { useCreateSubscriptionPortalMutation } from '../features/subscriptions/use-create-subscription-portal-mutation'
import { useCurrentSubscriptionQuery } from '../features/subscriptions/use-current-subscription-query'
import { useSubscriptionPlansQuery } from '../features/subscriptions/use-subscription-plans-query'

interface SettingsSearch {
  checkout?: 'success' | 'cancelled'
}

export const Route = createFileRoute('/settings')({
  beforeLoad: requireAuthBeforeLoad,
  validateSearch: (search: Record<string, unknown>): SettingsSearch => {
    if (search.checkout === 'success' || search.checkout === 'cancelled') {
      return {
        checkout: search.checkout,
      }
    }

    return {}
  },
  component: SettingsRoute,
})

function SettingsRoute() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const checkoutStatus = useRouterState({
    select: (state) => state.location.search.checkout,
  })
  const meQuery = useMeQuery()
  const currentSubscriptionQuery = useCurrentSubscriptionQuery()
  const subscriptionPlansQuery = useSubscriptionPlansQuery()
  const checkoutMutation = useCreateSubscriptionCheckoutMutation()
  const portalMutation = useCreateSubscriptionPortalMutation()
  const [errorMessage, setErrorMessage] = useState('')
  const [isLoggingOut, setIsLoggingOut] = useState(false)

  const paidPlans =
    subscriptionPlansQuery.data?.filter(
      (plan) => !plan.is_default && plan.prices.length > 0,
    ) ?? []
  const usesStripePortal =
    currentSubscriptionQuery.data?.billing_portal_available === true

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

  async function handlePortal() {
    try {
      setErrorMessage('')
      const portal = await portalMutation.mutateAsync()
      redirectToPortal(portal.url)
    } catch (error) {
      if (error instanceof Error) {
        setErrorMessage(error.message)
        return
      }

      setErrorMessage('Customer Portal failed to open')
    }
  }

  if (!meQuery.data) {
    return <p>Loading...</p>
  }

  return (
    <section className="settings-screen">
      <header className="settings-header">
        <div>
          <p className="eyebrow">Account</p>
          <h1>Settings</h1>
          <p>Signed in as {meQuery.data.email}</p>
        </div>
      </header>

      {checkoutStatus === 'success' ? (
        <p className="settings-alert" role="status">
          Checkout completed. Your plan will update after payment confirmation.
        </p>
      ) : null}
      {checkoutStatus === 'cancelled' ? (
        <p className="settings-alert" role="status">
          Checkout cancelled. Your plan was not changed.
        </p>
      ) : null}

      <section
        className="subscription-card subscription-card-featured"
        aria-label="Current subscription"
      >
        <div className="subscription-card-header">
          <div>
            <p className="meta-label">Current subscription</p>
            <h2>Current Plan</h2>
          </div>
          {currentSubscriptionQuery.data ? (
            <span className="status-pill">
              {currentSubscriptionQuery.data.cancel_at ? 'Cancelling' : 'Active'}
            </span>
          ) : null}
        </div>
        {currentSubscriptionQuery.isPending ? (
          <p>Loading current plan...</p>
        ) : null}
        {currentSubscriptionQuery.isError ? (
          <p>Current plan failed to load.</p>
        ) : null}
        {currentSubscriptionQuery.data ? (
          <div className="subscription-current-layout">
            <div>
              <h3>{currentSubscriptionQuery.data.plan.name}</h3>
              <div className="subscription-detail-grid">
                <div>
                  <span className="subscription-detail-label">Metrics</span>
                  <strong>
                    {
                      currentSubscriptionQuery.data.plan
                        .active_custom_metric_limit
                    }{' '}
                    custom metrics
                  </strong>
                </div>
                <div>
                  <span className="subscription-detail-label">Sync</span>
                  <strong>
                    Sync every{' '}
                    {currentSubscriptionQuery.data.plan.sync_interval_minutes}{' '}
                    minutes
                  </strong>
                </div>
                {currentSubscriptionQuery.data.price ? (
                  <div>
                    <span className="subscription-detail-label">Price</span>
                    <strong>
                      {formatSubscriptionPrice(
                        currentSubscriptionQuery.data.price.unit_amount,
                        currentSubscriptionQuery.data.price.currency,
                      )}{' '}
                      / {currentSubscriptionQuery.data.price.billing_interval}
                    </strong>
                  </div>
                ) : null}
                {currentSubscriptionQuery.data.price ? (
                  <div>
                    <span className="subscription-detail-label">Interval</span>
                    <strong>
                      {formatBillingInterval(
                        currentSubscriptionQuery.data.price.billing_interval,
                      )}
                    </strong>
                  </div>
                ) : null}
              </div>
            </div>
            <div className="subscription-billing-panel">
              {currentSubscriptionQuery.data.cancel_at ? (
                <p>
                  Cancels{' '}
                  {formatSubscriptionDate(
                    currentSubscriptionQuery.data.cancel_at,
                  )}
                </p>
              ) : currentSubscriptionQuery.data.current_period_end ? (
                <p>
                  Renews{' '}
                  {formatSubscriptionDate(
                    currentSubscriptionQuery.data.current_period_end,
                  )}
                </p>
              ) : (
                <p>No paid billing period yet.</p>
              )}
            </div>
            {currentSubscriptionQuery.data.billing_portal_available ? (
              <button
                className="subscription-primary-action"
                type="button"
                disabled={portalMutation.isPending}
                onClick={() => void handlePortal()}
              >
                Manage subscription
              </button>
            ) : null}
          </div>
        ) : null}
      </section>

      <section className="subscription-card" aria-label="Available plans">
        <div className="subscription-card-header">
          <div>
            <p className="meta-label">Plan catalog</p>
            <h2>Available Plans</h2>
          </div>
        </div>
        {subscriptionPlansQuery.isPending ? (
          <p>Loading available plans...</p>
        ) : null}
        {subscriptionPlansQuery.isError ? (
          <p>Available plans failed to load.</p>
        ) : null}
        {usesStripePortal ? (
          <p className="subscription-help-text">
            Use Manage subscription to change billing details.
          </p>
        ) : null}
        {usesStripePortal ? null : paidPlans.map((plan) => (
          <article className="subscription-plan-card" key={plan.code}>
            <div>
              <h3>{plan.name}</h3>
              <p>{plan.active_custom_metric_limit} custom metrics</p>
              <p>Sync every {plan.sync_interval_minutes} minutes</p>
            </div>
            <ul className="subscription-price-list">
              {plan.prices.map((price) => (
                <li key={price.id}>
                  <span>
                    {formatSubscriptionPrice(price.unit_amount, price.currency)}{' '}
                    / {price.billing_interval}
                  </span>
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

      {errorMessage ? <p className="error-text">{errorMessage}</p> : null}
      <button
        className="settings-logout-button"
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

function formatBillingInterval(interval: string) {
  if (interval === 'month') {
    return 'Monthly'
  }

  if (interval === 'year') {
    return 'Yearly'
  }

  return interval
}

function formatSubscriptionDate(value: string) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(value))
}
