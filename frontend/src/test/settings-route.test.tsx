import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('../features/auth/auth-bootstrap', () => ({
  restoreWebSession: vi.fn().mockResolvedValue({ access: 'test-access-token' }),
}))

vi.mock('../features/auth/auth-me-api', () => ({
  getMe: vi.fn(),
}))

vi.mock('../features/subscriptions/subscriptions-api', () => ({
  createSubscriptionCheckout: vi.fn(),
  createSubscriptionPortal: vi.fn(),
  getCurrentSubscription: vi.fn(),
  getSubscriptionPlans: vi.fn(),
}))

vi.mock('../features/subscriptions/checkout-redirect', () => ({
  redirectToCheckout: vi.fn(),
}))

vi.mock('../features/subscriptions/portal-redirect', () => ({
  redirectToPortal: vi.fn(),
}))

import { getMe } from '../features/auth/auth-me-api'
import { redirectToCheckout } from '../features/subscriptions/checkout-redirect'
import { redirectToPortal } from '../features/subscriptions/portal-redirect'
import {
  createSubscriptionCheckout,
  createSubscriptionPortal,
  getCurrentSubscription,
  getSubscriptionPlans,
  type CurrentSubscription,
} from '../features/subscriptions/subscriptions-api'
import { renderRoute } from './render-route'

const getMeMock = vi.mocked(getMe)
const createSubscriptionCheckoutMock = vi.mocked(createSubscriptionCheckout)
const createSubscriptionPortalMock = vi.mocked(createSubscriptionPortal)
const getCurrentSubscriptionMock = vi.mocked(getCurrentSubscription)
const getSubscriptionPlansMock = vi.mocked(getSubscriptionPlans)
const redirectToCheckoutMock = vi.mocked(redirectToCheckout)
const redirectToPortalMock = vi.mocked(redirectToPortal)

function freeSubscription(): CurrentSubscription {
  return {
    id: 'subscription-id',
    status: 'active',
    billing_portal_available: false,
    current_period_start: null,
    current_period_end: null,
    cancel_at: null,
    cancel_at_period_end: false,
    price: null,
    plan: {
      code: 'free',
      name: 'Free',
      active_custom_metric_limit: 3,
      wearable_connection_limit: 0,
      sync_interval_minutes: 60,
      analytics_enabled: false,
      csv_import_enabled: false,
    },
  }
}

function proSubscription(): CurrentSubscription {
  return {
    id: 'subscription-id',
    status: 'active',
    billing_portal_available: true,
    current_period_start: '2026-07-02T00:00:00Z',
    current_period_end: '2026-08-02T00:00:00Z',
    cancel_at: null,
    cancel_at_period_end: false,
    price: {
      currency: 'usd',
      unit_amount: 1000,
      billing_interval: 'month',
    },
    plan: {
      code: 'pro',
      name: 'Pro',
      active_custom_metric_limit: 10,
      wearable_connection_limit: 2,
      sync_interval_minutes: 15,
      analytics_enabled: true,
      csv_import_enabled: true,
    },
  }
}

describe('settings route', () => {
  afterEach(() => {
    vi.resetAllMocks()
  })

  it('redirects to /login when the user is not authenticated', async () => {
    getMeMock.mockRejectedValue(
      new Error('Authentication credentials were not provided.'),
    )

    renderRoute('/settings')

    expect(
      await screen.findByRole('heading', { name: /login/i }),
    ).toBeInTheDocument()
  })

  it('renders settings for an authenticated user', async () => {
    getMeMock.mockResolvedValue({
      email: 'user@example.com',
    })
    getCurrentSubscriptionMock.mockResolvedValue(freeSubscription())
    getSubscriptionPlansMock.mockResolvedValue([])

    renderRoute('/settings')

    expect(
      await screen.findByRole('heading', { name: /settings/i }),
    ).toBeInTheDocument()

    expect(screen.getByText(/signed in as user@example.com/i)).toBeInTheDocument()
    expect(
      await screen.findByRole('heading', { name: /current plan/i }),
    ).toBeInTheDocument()
    expect(screen.getByText(/free/i)).toBeInTheDocument()
    expect(screen.getByText(/3 custom metrics/i)).toBeInTheDocument()
    expect(screen.getByText(/sync every 60 minutes/i)).toBeInTheDocument()
  })

  it('hides portal management when no Stripe billing customer exists', async () => {
    getMeMock.mockResolvedValue({
      email: 'user@example.com',
    })
    getCurrentSubscriptionMock.mockResolvedValue(freeSubscription())
    getSubscriptionPlansMock.mockResolvedValue([])

    renderRoute('/settings')

    expect(
      await screen.findByRole('heading', { name: /^free$/i }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /manage subscription/i }),
    ).not.toBeInTheDocument()
  })

  it('renders paid subscription billing interval and renewal date', async () => {
    getMeMock.mockResolvedValue({
      email: 'user@example.com',
    })
    getCurrentSubscriptionMock.mockResolvedValue(proSubscription())
    getSubscriptionPlansMock.mockResolvedValue([])

    renderRoute('/settings')

    expect(
      await screen.findByRole('heading', { name: /^pro$/i }),
    ).toBeInTheDocument()
    expect(screen.getByText(/\$10\.00 \/ month/i)).toBeInTheDocument()
    expect(screen.getByText(/monthly/i)).toBeInTheDocument()
    expect(screen.getByText(/renews aug 2, 2026/i)).toBeInTheDocument()
  })

  it('renders scheduled cancellation date for paid subscriptions', async () => {
    getMeMock.mockResolvedValue({
      email: 'user@example.com',
    })
    getCurrentSubscriptionMock.mockResolvedValue({
      ...proSubscription(),
      cancel_at: '2026-08-02T00:00:00Z',
      cancel_at_period_end: true,
    })
    getSubscriptionPlansMock.mockResolvedValue([])

    renderRoute('/settings')

    expect(
      await screen.findByText(/cancels aug 2, 2026/i),
    ).toBeInTheDocument()
  })

  it('lists available paid subscription prices', async () => {
    getMeMock.mockResolvedValue({
      email: 'user@example.com',
    })
    getCurrentSubscriptionMock.mockResolvedValue(freeSubscription())
    getSubscriptionPlansMock.mockResolvedValue([
      {
        code: 'free',
        name: 'Free',
        active_custom_metric_limit: 3,
        wearable_connection_limit: 0,
        sync_interval_minutes: 60,
        analytics_enabled: false,
        csv_import_enabled: false,
        is_default: true,
        prices: [],
      },
      {
        code: 'pro',
        name: 'Pro',
        active_custom_metric_limit: 10,
        wearable_connection_limit: 2,
        sync_interval_minutes: 15,
        analytics_enabled: true,
        csv_import_enabled: true,
        is_default: false,
        prices: [
          {
            id: 'monthly-price-id',
            currency: 'usd',
            unit_amount: 1000,
            billing_interval: 'month',
          },
          {
            id: 'yearly-price-id',
            currency: 'usd',
            unit_amount: 10000,
            billing_interval: 'year',
          },
        ],
      },
    ])

    renderRoute('/settings')

    const availablePlans = await screen.findByRole('region', {
      name: /available plans/i,
    })

    expect(
      within(availablePlans).getByRole('heading', { name: /available plans/i }),
    ).toBeInTheDocument()
    expect(
      await within(availablePlans).findByRole('heading', { name: /pro/i }),
    ).toBeInTheDocument()
    expect(
      within(availablePlans).queryByRole('heading', { name: /^free$/i }),
    ).not.toBeInTheDocument()
    expect(within(availablePlans).getByText(/\$10\.00 \/ month/i)).toBeInTheDocument()
    expect(within(availablePlans).getByText(/\$100\.00 \/ year/i)).toBeInTheDocument()
  })

  it('hides checkout upgrades for Stripe-managed subscriptions', async () => {
    getMeMock.mockResolvedValue({
      email: 'user@example.com',
    })
    getCurrentSubscriptionMock.mockResolvedValue(proSubscription())
    getSubscriptionPlansMock.mockResolvedValue([
      {
        code: 'pro',
        name: 'Pro',
        active_custom_metric_limit: 10,
        wearable_connection_limit: 2,
        sync_interval_minutes: 15,
        analytics_enabled: true,
        csv_import_enabled: true,
        is_default: false,
        prices: [
          {
            id: 'monthly-price-id',
            currency: 'usd',
            unit_amount: 1000,
            billing_interval: 'month',
          },
          {
            id: 'yearly-price-id',
            currency: 'usd',
            unit_amount: 10000,
            billing_interval: 'year',
          },
        ],
      },
    ])

    renderRoute('/settings')

    expect(
      await screen.findByText(
        /use manage subscription to change billing details/i,
      ),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /upgrade to pro monthly/i }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /upgrade to pro yearly/i }),
    ).not.toBeInTheDocument()
  })

  it('starts checkout for a selected paid price and redirects to Stripe', async () => {
    const user = userEvent.setup()

    getMeMock.mockResolvedValue({
      email: 'user@example.com',
    })
    getCurrentSubscriptionMock.mockResolvedValue(freeSubscription())
    getSubscriptionPlansMock.mockResolvedValue([
      {
        code: 'pro',
        name: 'Pro',
        active_custom_metric_limit: 10,
        wearable_connection_limit: 2,
        sync_interval_minutes: 15,
        analytics_enabled: true,
        csv_import_enabled: true,
        is_default: false,
        prices: [
          {
            id: 'monthly-price-id',
            currency: 'usd',
            unit_amount: 1000,
            billing_interval: 'month',
          },
        ],
      },
    ])
    createSubscriptionCheckoutMock.mockResolvedValue({
      url: 'https://checkout.stripe.com/c/test-session',
    })

    renderRoute('/settings')

    await user.click(
      await screen.findByRole('button', {
        name: /upgrade to pro monthly/i,
      }),
    )

    expect(createSubscriptionCheckoutMock).toHaveBeenCalledWith({
      priceId: 'monthly-price-id',
    })
    expect(redirectToCheckoutMock).toHaveBeenCalledWith(
      'https://checkout.stripe.com/c/test-session',
    )
  })

  it('opens the Stripe Customer Portal', async () => {
    const user = userEvent.setup()

    getMeMock.mockResolvedValue({
      email: 'user@example.com',
    })
    getCurrentSubscriptionMock.mockResolvedValue(proSubscription())
    getSubscriptionPlansMock.mockResolvedValue([])
    createSubscriptionPortalMock.mockResolvedValue({
      url: 'https://billing.stripe.com/p/test-session',
    })

    renderRoute('/settings')

    await user.click(
      await screen.findByRole('button', {
        name: /manage subscription/i,
      }),
    )

    expect(createSubscriptionPortalMock).toHaveBeenCalledOnce()
    expect(redirectToPortalMock).toHaveBeenCalledWith(
      'https://billing.stripe.com/p/test-session',
    )
  })

  it('shows an error and does not redirect when the Customer Portal fails', async () => {
    const user = userEvent.setup()

    getMeMock.mockResolvedValue({
      email: 'user@example.com',
    })
    getCurrentSubscriptionMock.mockResolvedValue(proSubscription())
    getSubscriptionPlansMock.mockResolvedValue([])
    createSubscriptionPortalMock.mockRejectedValue(
      new Error('Unable to create Customer Portal session.'),
    )

    renderRoute('/settings')

    await user.click(
      await screen.findByRole('button', {
        name: /manage subscription/i,
      }),
    )

    expect(
      await screen.findByText(
        /unable to create customer portal session\./i,
      ),
    ).toBeInTheDocument()
    expect(redirectToPortalMock).not.toHaveBeenCalled()
  })

  it('disables portal management while the session is being created', async () => {
    const user = userEvent.setup()
    let resolvePortal:
      | ((portal: { url: string }) => void)
      | undefined

    getMeMock.mockResolvedValue({
      email: 'user@example.com',
    })
    getCurrentSubscriptionMock.mockResolvedValue(proSubscription())
    getSubscriptionPlansMock.mockResolvedValue([])
    createSubscriptionPortalMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolvePortal = resolve
        }),
    )

    renderRoute('/settings')

    const manageSubscriptionButton = await screen.findByRole('button', {
      name: /manage subscription/i,
    })

    await user.click(manageSubscriptionButton)

    await waitFor(() => {
      expect(manageSubscriptionButton).toBeDisabled()
    })

    resolvePortal?.({
      url: 'https://billing.stripe.com/p/test-session',
    })
  })

   it('shows an informational message after returning from successful checkout', async () =>
  {
    getMeMock.mockResolvedValue({
      email: 'user@example.com',
    })
    getCurrentSubscriptionMock.mockResolvedValue(freeSubscription())
    getSubscriptionPlansMock.mockResolvedValue([])

    renderRoute('/settings?checkout=success')

    expect(
      await screen.findByText(
        /checkout completed\. your plan will update after payment confirmation/i,
      ),
    ).toBeInTheDocument()
  })

  it('shows an informational message after returning from cancelled checkout', async () =>
  {
    getMeMock.mockResolvedValue({
      email: 'user@example.com',
    })
    getCurrentSubscriptionMock.mockResolvedValue(freeSubscription())
    getSubscriptionPlansMock.mockResolvedValue([])

    renderRoute('/settings?checkout=cancelled')

    expect(
      await screen.findByText(/checkout cancelled\. your plan was not changed/i),
    ).toBeInTheDocument()
  })

})
