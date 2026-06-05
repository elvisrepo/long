import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'

import { updateMetricDefinition } from './metric-definitions-api'
import { useUpdateMetricDefinitionMutation } from './use-update-metric-definition-mutation'

vi.mock('./metric-definitions-api', () => ({
    updateMetricDefinition: vi.fn(),
  }))

function createWrapper(queryClient: QueryClient) {
    return function Wrapper({ children }: { children: ReactNode }) {
      return (
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      )
    }
  }

describe('useUpdateMetricDefinitionMutation', () => {
    it('updates a metric definition and invalidates metric definition queries', async () => {
        const queryClient = new QueryClient({
            defaultOptions: {
            queries: { retry: false },
            mutations: { retry: false },
            },
        })

        const invalidateQueriesSpy = vi.spyOn(queryClient, 'invalidateQueries')
      vi.mocked(updateMetricDefinition).mockResolvedValue({
        id: 'metric-id',
        name: 'Mood Score',
        slug: 'mood',
        unit: 'points',
        category: 'custom',
        min_value: 0,
        max_value: 100,
        is_default: false,
        is_active: true,
      })

      const { result } = renderHook(() => useUpdateMetricDefinitionMutation(), {
        wrapper: createWrapper(queryClient),
      })

      result.current.mutate({
        id: 'metric-id',
        input: {
          name: 'Mood Score',
          unit: 'points',
          minValue: 0,
          maxValue: 100,
        },
      })

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true)
      })

      expect(updateMetricDefinition).toHaveBeenCalledWith('metric-id', {
        name: 'Mood Score',
        unit: 'points',
        minValue: 0,
        maxValue: 100,
      })
      expect(invalidateQueriesSpy).toHaveBeenCalledWith({
        queryKey: ['metric-definitions'],
      })
    })
    
})
