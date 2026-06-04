import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, test, vi } from 'vitest'

import { getMetricDefinitions } from './metric-definitions-api'
import { useMetricDefinitionsQuery} from './use-metric-definitions-query'
 
 vi.mock('./metric-definitions-api', () => ({
    getMetricDefinitions: vi.fn(),
  }))

function createWrapper() {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          // Keep hook tests deterministic: one failed call should become an error immediately.
          retry: false,
        },
      },
    })

    // React Query hooks require a QueryClientProvider even when the API is mocked.
    return function Wrapper({ children }: { children: React.ReactNode }) {
      return (
        <QueryClientProvider client={queryClient}>
          {children}
        </QueryClientProvider>
      )
    }
  }

 describe('useMetricDefinitionsQuery', () => {

    afterEach(() => {
      vi.clearAllMocks()
    })

    test('returns metric definitions when the API succeeds', async () => {
      vi.mocked(getMetricDefinitions).mockResolvedValueOnce([
        {
          id: 'metric-id',
          name: 'Resting Heart Rate',
          slug: 'resting_hr',
          unit: 'bpm',
          category: 'cardiovascular',
          min_value: 20,
          max_value: 220,
          is_default: true,
          is_active: true,
        },
      ])

      const { result } = renderHook(() => useMetricDefinitionsQuery(), {
        wrapper: createWrapper(),
      })

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true)
      })

      expect(result.current.data).toEqual([
        {
          id: 'metric-id',
          name: 'Resting Heart Rate',
          slug: 'resting_hr',
          unit: 'bpm',
          category: 'cardiovascular',
          min_value: 20,
          max_value: 220,
          is_default: true,
          is_active: true,
        },
      ])
      expect(getMetricDefinitions).toHaveBeenCalledWith({})
    })

    test('passes includeInactive to the API', async () => {
      vi.mocked(getMetricDefinitions).mockResolvedValueOnce([])

      const { result } = renderHook(
        () => useMetricDefinitionsQuery({ includeInactive: true }),
        {
          wrapper: createWrapper(),
        },
      )

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true)
      })

      expect(getMetricDefinitions).toHaveBeenCalledWith({
        includeInactive: true,
      })
    })

    test('exposes an error state when the API fails', async () => {
      vi.mocked(getMetricDefinitions).mockRejectedValueOnce(
        new Error('Metric definitions failed to load'),
      )

      const { result } = renderHook(() => useMetricDefinitionsQuery(), {
        wrapper: createWrapper(),
      })

      await waitFor(() => {
        expect(result.current.isError).toBe(true)
      })
    })

})
