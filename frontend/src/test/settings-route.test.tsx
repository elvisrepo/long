import { screen, within } from '@testing-library/react'
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
  getCurrentSubscription: vi.fn(),
  getSubscriptionPlans: vi.fn(),
}))

vi.mock('../features/subscriptions/checkout-redirect', () => ({
  redirectToCheckout: vi.fn(),
}))

import { getMe } from '../features/auth/auth-me-api'
import { redirectToCheckout } from '../features/subscriptions/checkout-redirect'
import {
  createSubscriptionCheckout,
  getCurrentSubscription,
  getSubscriptionPlans,
} from '../features/subscriptions/subscriptions-api'
import { renderRoute } from './render-route'

const getMeMock = vi.mocked(getMe)
const createSubscriptionCheckoutMock = vi.mocked(createSubscriptionCheckout)
const getCurrentSubscriptionMock = vi.mocked(getCurrentSubscription)
const getSubscriptionPlansMock = vi.mocked(getSubscriptionPlans)
const redirectToCheckoutMock = vi.mocked(redirectToCheckout)

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
    getCurrentSubscriptionMock.mockResolvedValue({
      id: 'subscription-id',
      status: 'active',
      plan: {
        code: 'free',
        name: 'Free',
        active_custom_metric_limit: 3,
        wearable_connection_limit: 0,
        sync_interval_minutes: 60,
        analytics_enabled: false,
        csv_import_enabled: false,
      },
    })
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

  it('lists available paid subscription prices', async () => {
    getMeMock.mockResolvedValue({
      email: 'user@example.com',
    })
    getCurrentSubscriptionMock.mockResolvedValue({
      id: 'subscription-id',
      status: 'active',
      plan: {
        code: 'free',
        name: 'Free',
        active_custom_metric_limit: 3,
        wearable_connection_limit: 0,
        sync_interval_minutes: 60,
        analytics_enabled: false,
        csv_import_enabled: false,
      },
    })
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

  it('starts checkout for a selected paid price and redirects to Stripe', async () => {
    const user = userEvent.setup()

    getMeMock.mockResolvedValue({
      email: 'user@example.com',
    })
    getCurrentSubscriptionMock.mockResolvedValue({
      id: 'subscription-id',
      status: 'active',
      plan: {
        code: 'free',
        name: 'Free',
        active_custom_metric_limit: 3,
        wearable_connection_limit: 0,
        sync_interval_minutes: 60,
        analytics_enabled: false,
        csv_import_enabled: false,
      },
    })
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
})
