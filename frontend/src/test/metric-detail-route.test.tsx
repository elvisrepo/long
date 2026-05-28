import { screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { getMe } from '../features/auth/auth-me-api'
import { useMetricDefinitionsQuery } from '../features/metrics/use-metric-definitions-query'
import { useMetricEntriesQuery } from '../features/metrics/use-metric-entries-query'
import { renderRoute } from './render-route'

vi.mock('../features/auth/auth-me-api', () => ({
  getMe: vi.fn(),
}))

vi.mock('../features/metrics/use-metric-definitions-query', () => ({
  useMetricDefinitionsQuery: vi.fn(),
}))

vi.mock('../features/metrics/use-metric-entries-query', () => ({
  useMetricEntriesQuery: vi.fn(),
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

function mockLoadedMetricEntries() {
  vi.mocked(useMetricEntriesQuery).mockReturnValue({
    data: [
      {
        id: 1,
        metric_definition: 'resting_hr',
        value: 58,
        recorded_at: '2026-03-05T07:15:00Z',
        source: 'manual',
        context: {},
        created_at: '2026-03-05T07:15:02Z',
      },
    ],
    isLoading: false,
    isError: false,
  } as ReturnType<typeof useMetricEntriesQuery>)
}

describe('metric detail route', () => {
  afterEach(() => {
    vi.resetAllMocks()
  })

  it('renders one metric and its entry history for an authenticated user', async () => {
    vi.mocked(getMe).mockResolvedValue({
      email: 'user@example.com',
    })
    mockLoadedMetricDefinitions()
    mockLoadedMetricEntries()

    renderRoute('/metrics/resting_hr')

    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: /resting heart rate/i,
      }),
    ).toBeInTheDocument()
    expect(screen.getByText(/resting_hr · bpm/i)).toBeInTheDocument()

    const summary = screen.getByRole('region', {
      name: /metric summary/i,
    })
    expect(within(summary).getByText(/latest value/i)).toBeInTheDocument()
    expect(within(summary).getByLabelText(/58 bpm/i)).toBeInTheDocument()
    expect(within(summary).getByText(/1 entries/i)).toBeInTheDocument()
    expect(within(summary).getByText(/20-220 bpm/i)).toBeInTheDocument()

    const history = screen.getByRole('region', {
      name: /metric entry history/i,
    })
    expect(
      within(history).getByRole('heading', { name: /entry history/i }),
    ).toBeInTheDocument()
    expect(within(history).getByText(/58 bpm/i)).toBeInTheDocument()
    expect(useMetricEntriesQuery).toHaveBeenCalledWith({
      metric: 'resting_hr',
    })
  })

  it('redirects to /login when the user is not authenticated', async () => {
    vi.mocked(getMe).mockRejectedValue(
      new Error('Authentication credentials were not provided.'),
    )
    mockLoadedMetricDefinitions()
    mockLoadedMetricEntries()

    renderRoute('/metrics/resting_hr')

    expect(
      await screen.findByRole('heading', { name: /login/i }),
    ).toBeInTheDocument()
  })
})
