import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMetricDefinition } from './metric-definitions-api'
import { useCreateMetricDefinitionMutation } from './use-create-metric-definition-mutation'

vi.mock('./metric-definitions-api', () => ({
  createMetricDefinition: vi.fn(),
}))

const createMetricDefinitionMock = vi.mocked(createMetricDefinition)

function createWrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    )
  }
}

describe('useCreateMetricDefinitionMutation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('creates a custom metric definition and invalidates metric-definition queries', async () => {
    const queryClient = new QueryClient()
    const invalidateQueriesSpy = vi.spyOn(queryClient, 'invalidateQueries')

    createMetricDefinitionMock.mockResolvedValue({
      id: 'metric-id',
      name: 'Mood',
      slug: 'mood',
      unit: 'score',
      category: 'custom',
      min_value: 1,
      max_value: 10,
      is_default: false,
      is_active: true,
    })

    const { result } = renderHook(() => useCreateMetricDefinitionMutation(), {
      wrapper: createWrapper(queryClient),
    })

    const input = {
      name: 'Mood',
      slug: 'mood',
      unit: 'score',
      minValue: 1,
      maxValue: 10,
    }

    await act(async () => {
      await result.current.mutateAsync(input)
    })

    expect(createMetricDefinitionMock).toHaveBeenCalledWith(input)
    expect(invalidateQueriesSpy).toHaveBeenCalledWith({
      queryKey: ['metric-definitions'],
    })
    expect(invalidateQueriesSpy).toHaveBeenCalledWith({
      queryKey: ['metric-usage'],
    })
  })
})
