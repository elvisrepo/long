import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createSubscriptionCheckout } from './subscriptions-api'
import { useCreateSubscriptionCheckoutMutation } from './use-create-subscription-checkout-mutation'

vi.mock('./subscriptions-api', () => ({
  createSubscriptionCheckout: vi.fn(),
}))

const createSubscriptionCheckoutMock = vi.mocked(createSubscriptionCheckout)

function createWrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    )
  }
}

describe('useCreateSubscriptionCheckoutMutation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('creates a checkout session for the selected internal price id', async () => {
    const queryClient = new QueryClient()

    createSubscriptionCheckoutMock.mockResolvedValue({
      url: 'https://checkout.stripe.com/c/test-session',
    })

    const { result } = renderHook(
      () => useCreateSubscriptionCheckoutMutation(),
      {
        wrapper: createWrapper(queryClient),
      },
    )

    const input = {
      priceId: 'price-id',
    }

    await act(async () => {
      await result.current.mutateAsync(input)
    })

    expect(createSubscriptionCheckoutMock).toHaveBeenCalledWith(input)
  })
})
