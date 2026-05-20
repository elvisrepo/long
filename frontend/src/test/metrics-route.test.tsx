import { screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { getMe } from '../features/auth/auth-me-api'
import { useMetricDefinitionsQuery } from '../features/metrics/use-metric-definitions-query'
import { renderRoute } from './render-route'

 vi.mock('../features/auth/auth-me-api', () => ({
    getMe: vi.fn(),
  }))

 vi.mock('../features/metrics/use-metric-definitions-query', () => ({
    useMetricDefinitionsQuery: vi.fn(),
  }))

 function mockLoadedMetricDefinitions() {
    vi.mocked(useMetricDefinitionsQuery).mockReturnValue({
      data: [
        {
          id: 'metric-id',
          name: 'Resting Heart Rate',
          slug: 'resting_hr',
          unit: 'bpm',
          category: 'cardiovascular',
          min_value: 20,
          max_value: 220,
          is_default: true,
        },
      ],
      isLoading: false,
      isError: false,
    } as ReturnType<typeof useMetricDefinitionsQuery>)
  }

describe('metrics route', () => {
    afterEach(() => {
      vi.resetAllMocks()
    })

    it('renders available metrics for an authenticated user', async () => {
      vi.mocked(getMe).mockResolvedValue({
        email: 'user@example.com',
      })
      mockLoadedMetricDefinitions()

      renderRoute('/metrics')

      expect(
        await screen.findByRole('heading', { name: /metrics/i }),
      ).toBeInTheDocument()
      expect(
        screen.getByRole('heading', { name: /resting heart rate/i }),
      ).toBeInTheDocument()
      expect(screen.getByText(/cardiovascular · bpm/i)).toBeInTheDocument()
    })

    it('redirects to /login when the user is not authenticated', async () => {
      vi.mocked(getMe).mockRejectedValue(
        new Error('Authentication credentials were not provided.'),
      )
      mockLoadedMetricDefinitions()

      renderRoute('/metrics')

      expect(
        await screen.findByRole('heading', { name: /login/i }),
      ).toBeInTheDocument()
    })
  })

