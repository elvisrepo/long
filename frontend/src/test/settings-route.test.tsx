import { screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('../features/auth/auth-bootstrap', () => ({
  restoreWebSession: vi.fn().mockResolvedValue({ access: 'test-access-token' }),
}))

vi.mock('../features/auth/auth-me-api', () => ({
  getMe: vi.fn(),
}))

vi.mock('../features/subscriptions/subscriptions-api', () => ({
  getCurrentSubscription: vi.fn(),
}))

import { getMe } from '../features/auth/auth-me-api'
import { getCurrentSubscription } from '../features/subscriptions/subscriptions-api'
import { renderRoute } from './render-route'

const getMeMock = vi.mocked(getMe)
const getCurrentSubscriptionMock = vi.mocked(getCurrentSubscription)

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
})
