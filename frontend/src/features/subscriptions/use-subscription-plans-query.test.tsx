import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getSubscriptionPlans } from './subscriptions-api'
import { useSubscriptionPlansQuery } from './use-subscription-plans-query'

vi.mock('./subscriptions-api', () => ({
  getSubscriptionPlans: vi.fn(),
}))

const getSubscriptionPlansMock = vi.mocked(getSubscriptionPlans)

function createWrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    )
  }
}

describe('useSubscriptionPlansQuery', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('loads the subscription plan catalog with active prices', async () => {
    const queryClient = new QueryClient()

    getSubscriptionPlansMock.mockResolvedValue([
      {
        code: 'pro',
        name: 'Pro',
        active_custom_metric_limit: 10,
        wearable_connection_limit: 2,
        automatic_sync_enabled: true,
        sync_interval_minutes: 15,
        analytics_enabled: true,
        csv_import_enabled: true,
        is_default: false,
        prices: [
          {
            id: 'price-id',
            currency: 'usd',
            unit_amount: 1000,
            billing_interval: 'month',
          },
        ],
      },
    ])

    const { result } = renderHook(() => useSubscriptionPlansQuery(), {
      wrapper: createWrapper(queryClient),
    })

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })

    expect(getSubscriptionPlansMock).toHaveBeenCalledTimes(1)
    expect(result.current.data?.[0]?.prices[0]?.id).toBe('price-id')
  })
})
