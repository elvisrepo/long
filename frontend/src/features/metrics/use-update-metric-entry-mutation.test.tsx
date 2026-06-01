import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { type ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { updateMetricEntry } from './metric-entries-api'
import { useUpdateMetricEntryMutation } from './use-update-metric-entry-mutation'

vi.mock('./metric-entries-api', () => ({
    updateMetricEntry: vi.fn(),
  }))

function createWrapper(queryClient: QueryClient) {
    return function Wrapper({ children }: { children: ReactNode }) {
      return (
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      )
    }
  }

describe('useUpdateMetricEntryMutation', () => {
    beforeEach(() => {
      vi.resetAllMocks()
    })

    it('updates a metric entry and invalidates metric entry queries', async () => {
      const queryClient = new QueryClient({
        defaultOptions: {
          queries: {
            retry: false,
          },
        },
      })
      const invalidateQueriesSpy = vi.spyOn(queryClient, 'invalidateQueries')

      vi.mocked(updateMetricEntry).mockResolvedValue({
        id: 1,
        metric_definition: 'resting_hr',
        value: 62,
        recorded_at: '2026-03-06T08:30:00Z',
        source: 'manual',
        context: { notes: 'after walk' },
        created_at: '2026-03-05T07:15:02Z',
      })

      const { result } = renderHook(() => useUpdateMetricEntryMutation(), {
        wrapper: createWrapper(queryClient),
      })

      result.current.mutate({
        id: 1,
        input: {
          value: 62,
          recordedAt: '2026-03-06T08:30:00Z',
          context: { notes: 'after walk' },
        },
      })

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true)
      })

      expect(updateMetricEntry).toHaveBeenCalledWith(1, {
        value: 62,
        recordedAt: '2026-03-06T08:30:00Z',
        context: { notes: 'after walk' },
      })
      expect(invalidateQueriesSpy).toHaveBeenCalledWith({
        queryKey: ['metric-entries'],
      })
    })
  })