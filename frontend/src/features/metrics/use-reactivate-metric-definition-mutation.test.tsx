 import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
  import { act, renderHook } from '@testing-library/react'
  import type { ReactNode } from 'react'
  import { beforeEach, describe, expect, it, vi } from 'vitest'

  import { updateMetricDefinition } from './metric-definitions-api'
  import { useReactivateMetricDefinitionMutation } from './use-reactivate-metric-definition-mutation'

  vi.mock('./metric-definitions-api', () => ({
    updateMetricDefinition: vi.fn(),
  }))

  const updateMetricDefinitionMock = vi.mocked(updateMetricDefinition)

  function createWrapper(queryClient: QueryClient) {
    return function Wrapper({ children }: { children: ReactNode }) {
      return (
        <QueryClientProvider client={queryClient}>
          {children}
        </QueryClientProvider>
      )
    }
  }

  describe('useReactivateMetricDefinitionMutation', () => {
    beforeEach(() => {
      vi.clearAllMocks()
    })

    it('reactivates a custom metric definition and invalidates related queries', async () => {
      const queryClient = new QueryClient()
      const invalidateQueriesSpy = vi.spyOn(queryClient, 'invalidateQueries')

      updateMetricDefinitionMock.mockResolvedValue({
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

      const { result } = renderHook(
        () => useReactivateMetricDefinitionMutation(),
        {
          wrapper: createWrapper(queryClient),
        },
      )

      await act(async () => {
        await result.current.mutateAsync('metric-id')
      })

      expect(updateMetricDefinitionMock).toHaveBeenCalledWith('metric-id', {
        isActive: true,
      })
      expect(invalidateQueriesSpy).toHaveBeenCalledWith({
        queryKey: ['metric-definitions'],
      })
      expect(invalidateQueriesSpy).toHaveBeenCalledWith({
        queryKey: ['metric-entries'],
      })
      expect(invalidateQueriesSpy).toHaveBeenCalledWith({
        queryKey: ['metric-usage'],
      })
    })
  })
