import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { restoreWebSession } from '../features/auth/auth-bootstrap'
import { getMe } from '../features/auth/auth-me-api'
import { createMetricEntry } from '../features/metrics/metric-entries-api'
import { useMetricDefinitionsQuery } from '../features/metrics/use-metric-definitions-query'
import { useMetricEntriesQuery } from '../features/metrics/use-metric-entries-query'
import { useCurrentSubscriptionQuery } from '../features/subscriptions/use-current-subscription-query'
import { renderRoute } from './render-route'

vi.mock('../features/auth/auth-me-api', () => ({
    getMe: vi.fn(),
  }))

  vi.mock('../features/auth/use-me-query', () => ({
    useMeQuery: vi.fn(() => {
      throw new Error('Dashboard route should use beforeLoad for auth')
    }),
  }))

vi.mock('../features/auth/auth-bootstrap', () => ({
  restoreWebSession: vi.fn().mockResolvedValue({ access: 'test-access-token' }),
}))

vi.mock('../features/metrics/use-metric-definitions-query', () => ({
  useMetricDefinitionsQuery: vi.fn(),
}))

vi.mock('../features/metrics/use-metric-entries-query', () => ({
  useMetricEntriesQuery: vi.fn(),
}))

vi.mock('../features/metrics/metric-entries-api', () => ({
  createMetricEntry: vi.fn(),
}))

vi.mock('../features/subscriptions/use-current-subscription-query', () => ({
  useCurrentSubscriptionQuery: vi.fn(),
}))

const createMetricEntryMock = vi.mocked(createMetricEntry)

function mockFreeSubscription() {
  vi.mocked(useCurrentSubscriptionQuery).mockReturnValue({
    data: {
      id: 'free-subscription-id',
      status: 'active',
      billing_portal_available: false,
      current_period_start: null,
      current_period_end: null,
      cancel_at: null,
      cancel_at_period_end: false,
      price: null,
      plan: {
        code: 'free',
        name: 'Free',
        active_custom_metric_limit: 3,
        wearable_connection_limit: 1,
        automatic_sync_enabled: false,
        sync_interval_minutes: 30,
        analytics_enabled: false,
        csv_import_enabled: false,
      },
    },
    isPending: false,
    isError: false,
  } as ReturnType<typeof useCurrentSubscriptionQuery>)
}

function mockProSubscription() {
  vi.mocked(useCurrentSubscriptionQuery).mockReturnValue({
    data: {
      id: 'pro-subscription-id',
      status: 'active',
      billing_portal_available: true,
      current_period_start: '2026-07-02T00:00:00Z',
      current_period_end: '2026-08-02T00:00:00Z',
      cancel_at: null,
      cancel_at_period_end: false,
      price: {
        currency: 'usd',
        unit_amount: 1000,
        billing_interval: 'month',
      },
      plan: {
        code: 'pro',
        name: 'Pro',
        active_custom_metric_limit: 10,
        wearable_connection_limit: 2,
        automatic_sync_enabled: true,
        sync_interval_minutes: 15,
        analytics_enabled: true,
        csv_import_enabled: true,
      },
    },
    isPending: false,
    isError: false,
  } as ReturnType<typeof useCurrentSubscriptionQuery>)
}

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
  mockLoadedMetricEntries()
}

function mockLoadedMetricDefinitionsWithManyMetrics() {
  vi.mocked(useMetricDefinitionsQuery).mockReturnValue({
    data: [
      {
        id: 'resting-hr-id',
        name: 'Resting Heart Rate',
        slug: 'resting_hr',
        unit: 'bpm',
        category: 'cardiovascular',
        min_value: 20,
        max_value: 220,
        is_default: true,
      },
      {
        id: 'body-weight-id',
        name: 'Body Weight',
        slug: 'body_weight',
        unit: 'kg',
        category: 'body_composition',
        min_value: 20,
        max_value: 300,
        is_default: true,
      },
    ],
    isLoading: false,
    isError: false,
  } as ReturnType<typeof useMetricDefinitionsQuery>)
  mockLoadedMetricEntries()
}

function mockLoadedMetricEntries(
  entries: NonNullable<ReturnType<typeof useMetricEntriesQuery>['data']> = [],
) {
  mockMetricEntriesByFilters({ cardEntries: entries, recentEntries: entries })
}

function mockMetricEntriesByFilters({
  cardEntries = [],
  recentEntries = [],
}: {
  cardEntries?: NonNullable<ReturnType<typeof useMetricEntriesQuery>['data']>
  recentEntries?: NonNullable<ReturnType<typeof useMetricEntriesQuery>['data']>
}) {
  vi.mocked(useMetricEntriesQuery).mockImplementation((filters) => {
    const entries =
      filters?.limit === 50 && !filters.metric ? cardEntries : recentEntries

    return {
      data: entries,
      isLoading: false,
      isError: false,
    } as ReturnType<typeof useMetricEntriesQuery>
  })
}

describe('dashboard route', () => {
  beforeEach(() => {
    mockFreeSubscription()
  })

  afterEach(() => {
    vi.resetAllMocks()
  })

  it('renders the dashboard for an authenticated user', async () => {
    vi.mocked(getMe).mockResolvedValue({
        email: 'user@example.com',
      })
    mockLoadedMetricDefinitions()

    renderRoute('/')

    expect(
      await screen.findByRole('heading', { name: /dashboard/i }),
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

    renderRoute('/')

    expect(
      await screen.findByRole('heading', { name: /login/i }),
    ).toBeInTheDocument()
  })

  it('waits for auth bootstrap before rendering the protected dashboard', async () => {
    let resolveRestore: (() => void) | undefined

    // Pending promise
    vi.mocked(restoreWebSession).mockReturnValue(
      new Promise((resolve) => {
        resolveRestore = () => resolve(undefined as never)
      }),
    )

    vi.mocked(getMe).mockResolvedValue({
        email: 'user@example.com',
      })
    mockLoadedMetricDefinitions()

    renderRoute('/')

    expect(screen.getByText(/restoring session/i)).toBeInTheDocument()
    expect(
      screen.queryByRole('heading', { name: /dashboard/i }),
    ).not.toBeInTheDocument()

   // Finish bootstrap manually
    resolveRestore?.()

    await waitFor(() => {
      expect(
        screen.getByRole('heading', { name: /dashboard/i }),
      ).toBeInTheDocument()
    })
  })

  it('shows a loading state while metric definitions are loading', async () => {
    vi.mocked(getMe).mockResolvedValue({
      email: 'user@example.com',
    })

    vi.mocked(useMetricDefinitionsQuery).mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    } as ReturnType<typeof useMetricDefinitionsQuery>)
    mockLoadedMetricEntries()

    renderRoute('/')

    expect(
      await screen.findByText(/loading metric definitions/i),
    ).toBeInTheDocument()
  })

  it('shows an error state when metric definitions fail to load', async () => {
    vi.mocked(getMe).mockResolvedValue({
      email: 'user@example.com',
    })

    vi.mocked(useMetricDefinitionsQuery).mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
    } as ReturnType<typeof useMetricDefinitionsQuery>)
    mockLoadedMetricEntries()

    renderRoute('/')

    expect(
      await screen.findByText(/metric definitions failed to load/i),
    ).toBeInTheDocument()
  })

  it('logs a resting heart rate metric entry from the dashboard', async () => {
    const user = userEvent.setup()

    vi.mocked(getMe).mockResolvedValue({
      email: 'user@example.com',
    })
    mockLoadedMetricDefinitions()
    createMetricEntryMock.mockResolvedValue({
      id: 1,
      metric_definition: 'resting_hr',
      value: 58,
      recorded_at: '2026-03-05T07:15:00Z',
      source: 'manual',
      context: {},
      created_at: '2026-03-05T07:15:02Z',
    })

    renderRoute('/')

    await screen.findByRole('heading', { name: /dashboard/i })

    await user.type(screen.getByLabelText(/resting heart rate value/i), '58')
    await user.click(
      screen.getByRole('button', { name: /log resting heart rate/i }),
    )

    expect(createMetricEntryMock).toHaveBeenCalledWith({
      metricDefinition: 'resting_hr',
      value: 58,
      recordedAt: expect.any(String),
      context: {},
    })
  })

  it('clears the metric entry value after logging succeeds', async () => {
    const user = userEvent.setup()

    vi.mocked(getMe).mockResolvedValue({
      email: 'user@example.com',
    })
    mockLoadedMetricDefinitions()
    createMetricEntryMock.mockResolvedValue({
      id: 1,
      metric_definition: 'resting_hr',
      value: 58,
      recorded_at: '2026-03-05T07:15:00Z',
      source: 'manual',
      context: {},
      created_at: '2026-03-05T07:15:02Z',
    })

    renderRoute('/')

    await screen.findByRole('heading', { name: /dashboard/i })

    const valueInput = screen.getByLabelText(/resting heart rate value/i)

    await user.type(valueInput, '58')
    await user.click(
      screen.getByRole('button', { name: /log resting heart rate/i }),
    )

    await waitFor(() => {
      expect(valueInput).toHaveValue(null)
    })
  })

   it('shows an error when metric entry logging fails', async () => {
    const user = userEvent.setup()

    vi.mocked(getMe).mockResolvedValue({
      email: 'user@example.com',
    })
    mockLoadedMetricDefinitions()
    createMetricEntryMock.mockRejectedValue(new Error('Metric entry failed to save'))

    renderRoute('/')

    await screen.findByRole('heading', { name: /dashboard/i })

    await user.type(screen.getByLabelText(/resting heart rate value/i), '500')
    await user.click(
      screen.getByRole('button', { name: /log resting heart rate/i }),
    )

    expect(
      await screen.findByText(/metric entry failed to save/i),
    ).toBeInTheDocument()
  })

  it('shows logged metric entries on the dashboard', async () => {
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
        source: 'samsung_health',
        context: {},
        created_at: '2026-03-05T07:15:02Z',
      },
    ])

    renderRoute('/')

    await screen.findByRole('heading', { name: /dashboard/i })

    expect(screen.getAllByText(/resting heart rate/i).length).toBeGreaterThan(0)
    expect(screen.getByText(/manual and synced records/i)).toBeInTheDocument()
    expect(screen.getByText(/samsung health/i)).toBeInTheDocument()
    expect(screen.getByText(/58 bpm/i)).toBeInTheDocument()
    expect(screen.getByText(/mar 5, 2026, 7:15 am/i)).toBeInTheDocument()
  })

  it('shows a locked Pro insights prompt for Free users', async () => {
    vi.mocked(getMe).mockResolvedValue({
      email: 'user@example.com',
    })
    mockLoadedMetricDefinitions()

    renderRoute('/')

    const insights = await screen.findByRole('region', {
      name: /pro insights/i,
    })

    expect(
      within(insights).getByRole('heading', { name: /pro insights/i }),
    ).toBeInTheDocument()
    expect(
      within(insights).getByText(/upgrade to pro to unlock trend summaries/i),
    ).toBeInTheDocument()
  })

  it('shows Pro insights when analytics are enabled', async () => {
    mockProSubscription()
    vi.mocked(getMe).mockResolvedValue({
      email: 'user@example.com',
    })
    mockLoadedMetricDefinitionsWithManyMetrics()
    mockMetricEntriesByFilters({
      cardEntries: [
        {
          id: 1,
          metric_definition: 'resting_hr',
          value: 61,
          recorded_at: '2026-03-06T07:15:00Z',
          source: 'manual',
          context: {},
          created_at: '2026-03-06T07:15:02Z',
        },
        {
          id: 2,
          metric_definition: 'body_weight',
          value: 87,
          recorded_at: '2026-03-01T07:15:00Z',
          source: 'manual',
          context: {},
          created_at: '2026-03-01T07:15:02Z',
        },
      ],
      recentEntries: [],
    })

    renderRoute('/')

    const insights = await screen.findByRole('region', {
      name: /pro insights/i,
    })

    expect(within(insights).getByText(/2 metrics with data/i)).toBeInTheDocument()
    expect(
      within(insights).getByText(/latest update mar 6, 2026/i),
    ).toBeInTheDocument()
  })

  it('limits recent entries on the dashboard', async () => {
    vi.mocked(getMe).mockResolvedValue({
      email: 'user@example.com',
    })
    mockLoadedMetricDefinitions()

    renderRoute('/')

    await screen.findByRole('heading', { name: /dashboard/i })

    expect(useMetricEntriesQuery).toHaveBeenCalledWith({ limit: 50 })
    expect(useMetricEntriesQuery).toHaveBeenCalledWith({ limit: 5 })
  })

  it('shows card latest values from entries beyond the five-entry recent list', async () => {
    vi.mocked(getMe).mockResolvedValue({
      email: 'user@example.com',
    })
    mockLoadedMetricDefinitionsWithManyMetrics()
    mockMetricEntriesByFilters({
      cardEntries: [
        {
          id: 1,
          metric_definition: 'resting_hr',
          value: 61,
          recorded_at: '2026-03-06T07:15:00Z',
          source: 'manual',
          context: {},
          created_at: '2026-03-06T07:15:02Z',
        },
        {
          id: 2,
          metric_definition: 'body_weight',
          value: 87,
          recorded_at: '2026-03-01T07:15:00Z',
          source: 'manual',
          context: {},
          created_at: '2026-03-01T07:15:02Z',
        },
      ],
      recentEntries: [
        {
          id: 3,
          metric_definition: 'resting_hr',
          value: 61,
          recorded_at: '2026-03-06T07:15:00Z',
          source: 'manual',
          context: {},
          created_at: '2026-03-06T07:15:02Z',
        },
      ],
    })

    renderRoute('/')

    await screen.findByRole('heading', { name: /dashboard/i })

    const bodyWeightCard = screen
      .getByRole('heading', { name: /body weight/i })
      .closest('.metric-card') as HTMLElement

    expect(bodyWeightCard).toHaveTextContent(/87\s*kg/i)
    expect(screen.getAllByRole('link', { name: /resting heart rate/i })).toHaveLength(
      2,
    )
    expect(screen.getByRole('link', { name: /body weight/i })).toHaveAttribute(
      'href',
      '/metrics/body_weight',
    )
  })

  it('formats body-weight floating-point noise across the dashboard', async () => {
    vi.mocked(getMe).mockResolvedValue({
      email: 'user@example.com',
    })
    mockLoadedMetricDefinitionsWithManyMetrics()
    const noisyBodyWeightEntry = {
      id: 1,
      metric_definition: 'body_weight',
      value: 83.5999984741211,
      recorded_at: '2026-08-05T07:15:00Z',
      source: 'samsung_health',
      context: {},
      created_at: '2026-08-05T07:15:02Z',
    }
    mockMetricEntriesByFilters({
      cardEntries: [noisyBodyWeightEntry],
      recentEntries: [noisyBodyWeightEntry],
    })

    renderRoute('/')

    await screen.findByRole('heading', { name: /dashboard/i })

    const bodyWeightCard = screen
      .getByRole('heading', { name: /body weight/i })
      .closest('.metric-card') as HTMLElement
    const recentEntries = screen.getByRole('region', {
      name: /metric entries/i,
    })

    expect(bodyWeightCard).toHaveTextContent(/83\.6\s*kg/i)
    expect(within(recentEntries).getByText(/^83\.6 kg$/i)).toBeInTheDocument()
  })

  it('keeps card latest values unfiltered when recent entries are filtered', async () => {
    const user = userEvent.setup()

    vi.mocked(getMe).mockResolvedValue({
      email: 'user@example.com',
    })
    mockLoadedMetricDefinitionsWithManyMetrics()
    mockMetricEntriesByFilters({
      cardEntries: [
        {
          id: 1,
          metric_definition: 'resting_hr',
          value: 61,
          recorded_at: '2026-03-06T07:15:00Z',
          source: 'manual',
          context: {},
          created_at: '2026-03-06T07:15:02Z',
        },
        {
          id: 2,
          metric_definition: 'body_weight',
          value: 87,
          recorded_at: '2026-03-01T07:15:00Z',
          source: 'manual',
          context: {},
          created_at: '2026-03-01T07:15:02Z',
        },
      ],
      recentEntries: [
        {
          id: 3,
          metric_definition: 'body_weight',
          value: 87,
          recorded_at: '2026-03-01T07:15:00Z',
          source: 'manual',
          context: {},
          created_at: '2026-03-01T07:15:02Z',
        },
      ],
    })

    renderRoute('/')

    await screen.findByRole('heading', { name: /dashboard/i })

    await user.selectOptions(
      screen.getByLabelText(/filter recent entries by metric/i),
      'body_weight',
    )

    const restingHeartRateCard = screen
      .getByRole('heading', { name: /resting heart rate/i })
      .closest('.metric-card') as HTMLElement

    expect(useMetricEntriesQuery).toHaveBeenCalledWith({ limit: 50 })
    expect(useMetricEntriesQuery).toHaveBeenLastCalledWith({
      metric: 'body_weight',
      limit: 5,
    })
    expect(restingHeartRateCard).toHaveTextContent(/61\s*bpm/i)
  })

  it('filters recent entries by selected metric', async () => {
    const user = userEvent.setup()

    vi.mocked(getMe).mockResolvedValue({
      email: 'user@example.com',
    })
    mockLoadedMetricDefinitions()

    renderRoute('/')

    await screen.findByRole('heading', { name: /dashboard/i })

    await user.selectOptions(
      screen.getByLabelText(/filter recent entries by metric/i),
      'resting_hr',
    )

    expect(useMetricEntriesQuery).toHaveBeenLastCalledWith({
      metric: 'resting_hr',
      limit: 5,
    })
  })

  it('links metric cards to their metric detail pages', async () => {
    vi.mocked(getMe).mockResolvedValue({
      email: 'user@example.com',
    })

    mockLoadedMetricDefinitions()
    mockLoadedMetricEntries([])

    renderRoute('/')

    const metricLink = await screen.findByRole('link', {
      name: /resting heart rate/i,
    })

    expect(metricLink).toHaveAttribute('href', '/metrics/resting_hr')
  })

 it('links recent entries to their metric detail pages', async () => {
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
    ])

    renderRoute('/')

    await screen.findByRole('heading', { name: /dashboard/i })

    const recentEntries = screen.getByRole('region', {
      name: /metric entries/i,
    })
    const entryLink = within(recentEntries).getByRole('link', {
      name: /resting heart rate/i,
    })

    expect(entryLink).toHaveAttribute('href', '/metrics/resting_hr')
  })
})
