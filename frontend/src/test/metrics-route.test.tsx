import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { getMe } from '../features/auth/auth-me-api'
import { createMetricDefinition } from '../features/metrics/metric-definitions-api'
import { useMetricDefinitionsQuery } from '../features/metrics/use-metric-definitions-query'
import { renderRoute } from './render-route'

 vi.mock('../features/auth/auth-me-api', () => ({
    getMe: vi.fn(),
  }))

 vi.mock('../features/metrics/use-metric-definitions-query', () => ({
    useMetricDefinitionsQuery: vi.fn(),
  }))

vi.mock('../features/metrics/metric-definitions-api', () => ({
    createMetricDefinition: vi.fn(),
  }))

const createMetricDefinitionMock = vi.mocked(createMetricDefinition)

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

    it('creates a custom metric definition from the metrics page', async () => {
      const user = userEvent.setup()

      vi.mocked(getMe).mockResolvedValue({
        email: 'user@example.com',
      })
      mockLoadedMetricDefinitions()
      createMetricDefinitionMock.mockResolvedValue({
        id: 'custom-metric-id',
        name: 'Mood',
        slug: 'mood',
        unit: 'score',
        category: 'custom',
        min_value: 1,
        max_value: 10,
        is_default: false,
      })

      renderRoute('/metrics')

      await screen.findByRole('heading', { name: /metrics/i })

      await user.type(screen.getByLabelText(/name/i), 'Mood')
      await user.type(screen.getByLabelText(/slug/i), 'mood')
      await user.type(screen.getByLabelText(/unit/i), 'score')
      await user.type(screen.getByLabelText(/min value/i), '1')
      await user.type(screen.getByLabelText(/max value/i), '10')
      await user.click(
        screen.getByRole('button', { name: /create custom metric/i }),
      )

      expect(createMetricDefinitionMock).toHaveBeenCalledWith({
        name: 'Mood',
        slug: 'mood',
        unit: 'score',
        minValue: 1,
        maxValue: 10,
      })
    })

  })

