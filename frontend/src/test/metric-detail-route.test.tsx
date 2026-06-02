import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { getMe } from '../features/auth/auth-me-api'
import { useDeleteMetricEntryMutation } from '../features/metrics/use-delete-metric-entry-mutation'
import { useMetricDefinitionsQuery } from '../features/metrics/use-metric-definitions-query'
import { useMetricEntriesQuery } from '../features/metrics/use-metric-entries-query'
import { useUpdateMetricEntryMutation } from '../features/metrics/use-update-metric-entry-mutation'
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

vi.mock('../features/metrics/use-update-metric-entry-mutation', () => ({
  useUpdateMetricEntryMutation: vi.fn(),
}))

vi.mock('../features/metrics/use-delete-metric-entry-mutation', () => ({
  useDeleteMetricEntryMutation: vi.fn(),
}))

const updateMetricEntryMutateAsyncMock = vi.fn()
const deleteMetricEntryMutateAsyncMock = vi.fn()

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

function mockLoadedMetricEntries(
  entries: NonNullable<ReturnType<typeof useMetricEntriesQuery>['data']> = [
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
) {
  vi.mocked(useMetricEntriesQuery).mockReturnValue({
    data: entries,
    isLoading: false,
    isError: false,
  } as ReturnType<typeof useMetricEntriesQuery>)
}

function mockMetricEntryMutations() {
  updateMetricEntryMutateAsyncMock.mockResolvedValue(undefined)
  deleteMetricEntryMutateAsyncMock.mockResolvedValue(undefined)

  vi.mocked(useUpdateMetricEntryMutation).mockReturnValue({
    mutateAsync: updateMetricEntryMutateAsyncMock,
    isPending: false,
  } as unknown as ReturnType<typeof useUpdateMetricEntryMutation>)

  vi.mocked(useDeleteMetricEntryMutation).mockReturnValue({
    mutateAsync: deleteMetricEntryMutateAsyncMock,
    isPending: false,
  } as unknown as ReturnType<typeof useDeleteMetricEntryMutation>)
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
    mockMetricEntryMutations()

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
      limit: 50,
    })
  })

  it('redirects to /login when the user is not authenticated', async () => {
    vi.mocked(getMe).mockRejectedValue(
      new Error('Authentication credentials were not provided.'),
    )
    mockLoadedMetricDefinitions()
    mockLoadedMetricEntries()
    mockMetricEntryMutations()

    renderRoute('/metrics/resting_hr')

    expect(
      await screen.findByRole('heading', { name: /login/i }),
    ).toBeInTheDocument()
  })

  it('filters metric entries by the selected 30 day range', async () => {
    const user = userEvent.setup()

    vi.mocked(getMe).mockResolvedValue({
      email: 'user@example.com',
    })
    mockLoadedMetricDefinitions()
    mockLoadedMetricEntries()
    mockMetricEntryMutations()

    renderRoute('/metrics/resting_hr')

    await screen.findByRole('heading', {
      level: 1,
      name: /resting heart rate/i,
    })

    const beforeClick = new Date()
    await user.click(screen.getByRole('button', { name: /30d/i }))
    const afterClick = new Date()

    const lastFilters = vi.mocked(useMetricEntriesQuery).mock.calls.at(-1)?.[0]
    const earliestExpectedFrom = new Date(beforeClick)
    const latestExpectedFrom = new Date(afterClick)
    earliestExpectedFrom.setUTCDate(earliestExpectedFrom.getUTCDate() - 30)
    latestExpectedFrom.setUTCDate(latestExpectedFrom.getUTCDate() - 30)

    expect(lastFilters).toMatchObject({
      metric: 'resting_hr',
      from: expect.any(String),
      limit: 50,
    })
    expect(new Date(lastFilters?.from ?? '').getTime()).toBeGreaterThanOrEqual(
      earliestExpectedFrom.getTime() - 1000,
    )
    expect(new Date(lastFilters?.from ?? '').getTime()).toBeLessThanOrEqual(
      latestExpectedFrom.getTime() + 1000,
    )
  })

  it('keeps the selected range filter stable across rerenders', async () => {
    const user = userEvent.setup()

    vi.mocked(getMe).mockResolvedValue({
      email: 'user@example.com',
    })
    mockLoadedMetricDefinitions()
    mockLoadedMetricEntries()
    mockMetricEntryMutations()

    renderRoute('/metrics/resting_hr')

    await screen.findByRole('heading', {
      level: 1,
      name: /resting heart rate/i,
    })

    await user.click(screen.getByRole('button', { name: /7d/i }))
    const firstRangeFilters = vi.mocked(useMetricEntriesQuery).mock.calls.at(
      -1,
    )?.[0]

    await user.click(screen.getByRole('button', { name: /7d/i }))
    const secondRangeFilters = vi.mocked(useMetricEntriesQuery).mock.calls.at(
      -1,
    )?.[0]

    expect(secondRangeFilters).toEqual(firstRangeFilters)
  })

  it('shows a simple trend overview from oldest to latest entry', async () => {
    vi.mocked(getMe).mockResolvedValue({
      email: 'user@example.com',
    })
    mockLoadedMetricDefinitions()
    mockLoadedMetricEntries([
      {
        id: 1,
        metric_definition: 'resting_hr',
        value: 58,
        recorded_at: '2026-03-05T07:15:00Z',
        source: 'manual',
        context: {},
        created_at: '2026-03-05T07:15:02Z',
      },
      {
        id: 2,
        metric_definition: 'resting_hr',
        value: 56,
        recorded_at: '2026-03-01T07:15:00Z',
        source: 'manual',
        context: {},
        created_at: '2026-03-01T07:15:02Z',
      },
    ])
    mockMetricEntryMutations()

    renderRoute('/metrics/resting_hr')

    await screen.findByRole('heading', {
      level: 1,
      name: /resting heart rate/i,
    })

    const trend = screen.getByRole('region', {
      name: /trend overview/i,
    })

    expect(
      within(trend).getByRole('heading', { name: /trend overview/i }),
    ).toBeInTheDocument()
    expect(
      within(trend).getByRole('img', {
        name: /resting heart rate trend chart/i,
      }),
    ).toBeInTheDocument()
    expect(within(trend).getByText(/56 to 58 bpm/i)).toBeInTheDocument()

    const trendStats = trend.querySelector('.trend-grid') as HTMLElement
    expect(within(trend).getByText(/oldest/i)).toBeInTheDocument()
    expect(within(trendStats).getByText(/56 bpm/i)).toBeInTheDocument()
    expect(within(trend).getByText(/latest/i)).toBeInTheDocument()
    expect(within(trendStats).getByText(/58 bpm/i)).toBeInTheDocument()
    expect(within(trendStats).getByText(/\+2 bpm/i)).toBeInTheDocument()
  })

  it('shows an empty state when the metric has no entries', async () => {
    vi.mocked(getMe).mockResolvedValue({
      email: 'user@example.com',
    })
    mockLoadedMetricDefinitions()
    mockLoadedMetricEntries([])
    mockMetricEntryMutations()

    renderRoute('/metrics/resting_hr')

    await screen.findByRole('heading', {
      level: 1,
      name: /resting heart rate/i,
    })

    const emptyState = screen
      .getByText(/no entries recorded yet/i)
      .closest('.empty-state') as HTMLElement

    expect(emptyState).toHaveTextContent(
      /log your first value from the dashboard\./i,
    )
    expect(
      within(emptyState).getByRole('link', { name: /dashboard/i }),
    ).toHaveAttribute(
      'href',
      '/',
    )
  })

  it('updates an entry from the metric history', async () => {
    const user = userEvent.setup()

    vi.mocked(getMe).mockResolvedValue({
      email: 'user@example.com',
    })
    mockLoadedMetricDefinitions()
    mockLoadedMetricEntries([
      {
        id: 1,
        metric_definition: 'resting_hr',
        value: 58,
        recorded_at: '2026-03-05T07:15:00Z',
        source: 'manual',
        context: { notes: 'before walk' },
        created_at: '2026-03-05T07:15:02Z',
      },
    ])
    mockMetricEntryMutations()

    renderRoute('/metrics/resting_hr')

    await screen.findByRole('heading', {
      level: 1,
      name: /resting heart rate/i,
    })

    await user.click(
      screen.getByRole('button', { name: /edit resting heart rate entry/i }),
    )
    await user.clear(screen.getByLabelText(/resting heart rate value/i))
    await user.type(screen.getByLabelText(/resting heart rate value/i), '62')
    await user.clear(screen.getByLabelText(/resting heart rate notes/i))
    await user.type(
      screen.getByLabelText(/resting heart rate notes/i),
      'after walk',
    )
    await user.click(
      screen.getByRole('button', {
        name: /save resting heart rate entry/i,
      }),
    )

    expect(updateMetricEntryMutateAsyncMock).toHaveBeenCalledWith({
      id: 1,
      input: {
        value: 62,
        recordedAt: '2026-03-05T07:15:00Z',
        context: { notes: 'after walk' },
      },
    })
  })

  it('deletes an entry from the metric history', async () => {
    const user = userEvent.setup()

    vi.mocked(getMe).mockResolvedValue({
      email: 'user@example.com',
    })
    mockLoadedMetricDefinitions()
    mockLoadedMetricEntries()
    mockMetricEntryMutations()

    renderRoute('/metrics/resting_hr')

    await screen.findByRole('heading', {
      level: 1,
      name: /resting heart rate/i,
    })

    await user.click(
      screen.getByRole('button', {
        name: /delete resting heart rate entry/i,
      }),
    )

    expect(deleteMetricEntryMutateAsyncMock).toHaveBeenCalledWith(1)
  })

  it('shows an error when updating an entry fails', async () => {
    const user = userEvent.setup()

    vi.mocked(getMe).mockResolvedValue({
      email: 'user@example.com',
    })
    mockLoadedMetricDefinitions()
    mockLoadedMetricEntries()
    mockMetricEntryMutations()
    updateMetricEntryMutateAsyncMock.mockRejectedValue(
      new Error('Metric entry failed to update'),
    )

    renderRoute('/metrics/resting_hr')

    await screen.findByRole('heading', {
      level: 1,
      name: /resting heart rate/i,
    })

    await user.click(
      screen.getByRole('button', { name: /edit resting heart rate entry/i }),
    )
    await user.click(
      screen.getByRole('button', {
        name: /save resting heart rate entry/i,
      }),
    )

    expect(
      await screen.findByText(/metric entry failed to update/i),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', {
        name: /save resting heart rate entry/i,
      }),
    ).toBeInTheDocument()
  })

  it('prevents saving an empty entry value', async () => {
    const user = userEvent.setup()

    vi.mocked(getMe).mockResolvedValue({
      email: 'user@example.com',
    })
    mockLoadedMetricDefinitions()
    mockLoadedMetricEntries()
    mockMetricEntryMutations()

    renderRoute('/metrics/resting_hr')

    await screen.findByRole('heading', {
      level: 1,
      name: /resting heart rate/i,
    })

    await user.click(
      screen.getByRole('button', { name: /edit resting heart rate entry/i }),
    )
    await user.clear(screen.getByLabelText(/resting heart rate value/i))
    await user.click(
      screen.getByRole('button', {
        name: /save resting heart rate entry/i,
      }),
    )

    expect(updateMetricEntryMutateAsyncMock).not.toHaveBeenCalled()
    expect(
      screen.getByText(/enter a numeric value before saving/i),
    ).toBeInTheDocument()
  })

  it('prevents saving a non-numeric entry value', async () => {
    const user = userEvent.setup()

    vi.mocked(getMe).mockResolvedValue({
      email: 'user@example.com',
    })
    mockLoadedMetricDefinitions()
    mockLoadedMetricEntries()
    mockMetricEntryMutations()

    renderRoute('/metrics/resting_hr')

    await screen.findByRole('heading', {
      level: 1,
      name: /resting heart rate/i,
    })

    await user.click(
      screen.getByRole('button', { name: /edit resting heart rate entry/i }),
    )
    await user.clear(screen.getByLabelText(/resting heart rate value/i))
    await user.type(screen.getByLabelText(/resting heart rate value/i), 'abc')
    await user.click(
      screen.getByRole('button', {
        name: /save resting heart rate entry/i,
      }),
    )

    expect(updateMetricEntryMutateAsyncMock).not.toHaveBeenCalled()
    expect(
      screen.getByText(/enter a numeric value before saving/i),
    ).toBeInTheDocument()
  })
})
