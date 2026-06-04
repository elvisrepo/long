import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { getMe } from '../features/auth/auth-me-api'
import {
  createMetricDefinition,
  type MetricDefinition,
} from '../features/metrics/metric-definitions-api'
import { useDeactivateMetricDefinitionMutation } from '../features/metrics/use-deactivate-metric-definition-mutation'
import { useMetricDefinitionsQuery } from '../features/metrics/use-metric-definitions-query'
import { useUpdateMetricDefinitionMutation } from '../features/metrics/use-update-metric-definition-mutation'
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

vi.mock('../features/metrics/use-update-metric-definition-mutation', () => ({
  useUpdateMetricDefinitionMutation: vi.fn(),
}))

vi.mock('../features/metrics/use-deactivate-metric-definition-mutation', () => ({
  useDeactivateMetricDefinitionMutation: vi.fn(),
}))

const createMetricDefinitionMock = vi.mocked(createMetricDefinition)
const updateMetricDefinitionMutateAsyncMock = vi.fn()
const deactivateMetricDefinitionMutateAsyncMock = vi.fn()

function mockLoadedMetricDefinitions(
  metricDefinitions: MetricDefinition[] = [
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
  ],
) {
  vi.mocked(useMetricDefinitionsQuery).mockReturnValue({
    data: metricDefinitions,
    isLoading: false,
    isError: false,
  } as ReturnType<typeof useMetricDefinitionsQuery>)
}

function mockUpdateMetricDefinitionMutation() {
  updateMetricDefinitionMutateAsyncMock.mockResolvedValue(undefined)

  vi.mocked(useUpdateMetricDefinitionMutation).mockReturnValue({
    mutateAsync: updateMetricDefinitionMutateAsyncMock,
    isPending: false,
    isError: false,
    error: null,
  } as unknown as ReturnType<typeof useUpdateMetricDefinitionMutation>)
}

function mockDeactivateMetricDefinitionMutation() {
  deactivateMetricDefinitionMutateAsyncMock.mockResolvedValue(undefined)

  vi.mocked(useDeactivateMetricDefinitionMutation).mockReturnValue({
    mutateAsync: deactivateMetricDefinitionMutateAsyncMock,
    isPending: false,
    isError: false,
    error: null,
  } as unknown as ReturnType<typeof useDeactivateMetricDefinitionMutation>)
}

function mockSuccessfulCustomMetricCreate() {
  createMetricDefinitionMock.mockResolvedValue({
    id: 'custom-metric-id',
    name: 'Mood',
    slug: 'mood',
    unit: 'score',
    category: 'custom',
    min_value: 1,
    max_value: 10,
    is_default: false,
    is_active: true,
  })
}

async function fillCustomMetricForm(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(/name/i), 'Mood')
  await user.type(screen.getByLabelText(/slug/i), 'mood')
  await user.type(screen.getByLabelText(/unit/i), 'score')
  await user.type(screen.getByLabelText(/min value/i), '1')
  await user.type(screen.getByLabelText(/max value/i), '10')
}

describe('metrics route', () => {
  beforeEach(() => {
    mockUpdateMetricDefinitionMutation()
    mockDeactivateMetricDefinitionMutation()
  })

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
    mockSuccessfulCustomMetricCreate()

    renderRoute('/metrics')

    await screen.findByRole('heading', { name: /metrics/i })

    await fillCustomMetricForm(user)
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

  it('clears the custom metric form after a successful create', async () => {
    const user = userEvent.setup()

    vi.mocked(getMe).mockResolvedValue({
      email: 'user@example.com',
    })
    mockLoadedMetricDefinitions()
    mockSuccessfulCustomMetricCreate()

    renderRoute('/metrics')

    await screen.findByRole('heading', { name: /metrics/i })

    const nameInput = screen.getByLabelText(/name/i)
    const slugInput = screen.getByLabelText(/slug/i)
    const unitInput = screen.getByLabelText(/unit/i)
    const minValueInput = screen.getByLabelText(/min value/i)
    const maxValueInput = screen.getByLabelText(/max value/i)

    await fillCustomMetricForm(user)
    await user.click(
      screen.getByRole('button', { name: /create custom metric/i }),
    )

    await waitFor(() => {
      expect(nameInput).toHaveValue('')
    })
    expect(slugInput).toHaveValue('')
    expect(unitInput).toHaveValue('')
    expect(minValueInput).toHaveValue(null)
    expect(maxValueInput).toHaveValue(null)
  })

  it('shows an error when custom metric creation fails', async () => {
    const user = userEvent.setup()

    vi.mocked(getMe).mockResolvedValue({
      email: 'user@example.com',
    })
    mockLoadedMetricDefinitions()
    createMetricDefinitionMock.mockRejectedValue(
      new Error('metric definition with this slug already exists.'),
    )

    renderRoute('/metrics')

    await screen.findByRole('heading', { name: /metrics/i })

    await fillCustomMetricForm(user)
    await user.click(
      screen.getByRole('button', { name: /create custom metric/i }),
    )

    expect(
      await screen.findByText(/metric definition with this slug already exists/i),
    ).toBeInTheDocument()
  })

 it('links each metric row to its metric detail page', async () => {
    vi.mocked(getMe).mockResolvedValue({
      email: 'user@example.com',
    })
    mockLoadedMetricDefinitions()

    renderRoute('/metrics')

    const metricLink = await screen.findByRole('link', {
      name: /resting heart rate/i,
    })

    expect(metricLink).toHaveAttribute('href', '/metrics/resting_hr')
  })

  it('navigates to the metric detail page when a metric row is clicked', async () => {
    const user = userEvent.setup()

    vi.mocked(getMe).mockResolvedValue({
      email: 'user@example.com',
    })
    mockLoadedMetricDefinitions()

    renderRoute('/metrics')

    await user.click(
      await screen.findByRole('link', { name: /resting heart rate/i }),
    )

    expect(
      await screen.findByRole('heading', { name: /resting heart rate/i }),
    ).toBeInTheDocument()
    expect(screen.getByText(/resting_hr · bpm/i)).toBeInTheDocument()
  })

  it('updates a custom metric from the metrics catalog', async () => {
    const user = userEvent.setup()

    vi.mocked(getMe).mockResolvedValue({
      email: 'user@example.com',
    })
    mockLoadedMetricDefinitions([
      {
        id: 'custom-metric-id',
        name: 'Mood',
        slug: 'mood',
        unit: 'score',
        category: 'custom',
        min_value: 1,
        max_value: 10,
        is_default: false,
        is_active: true,
      },
    ])

    renderRoute('/metrics')

    await screen.findByRole('heading', {
      level: 1,
      name: /metrics/i,
    })

    await user.click(screen.getByRole('button', { name: /edit mood/i }))
    await user.clear(screen.getByLabelText(/mood name/i))
    await user.type(screen.getByLabelText(/mood name/i), 'Mood Score')
    await user.clear(screen.getByLabelText(/mood unit/i))
    await user.type(screen.getByLabelText(/mood unit/i), 'points')
    await user.clear(screen.getByLabelText(/mood min value/i))
    await user.type(screen.getByLabelText(/mood min value/i), '0')
    await user.clear(screen.getByLabelText(/mood max value/i))
    await user.type(screen.getByLabelText(/mood max value/i), '100')

    await user.click(screen.getByRole('button', { name: /save mood/i }))

    expect(updateMetricDefinitionMutateAsyncMock).toHaveBeenCalledWith({
      id: 'custom-metric-id',
      input: {
        name: 'Mood Score',
        unit: 'points',
        minValue: 0,
        maxValue: 100,
      },
    })
  })

  it('does not show edit actions for default metrics', async () => {
    vi.mocked(getMe).mockResolvedValue({
      email: 'user@example.com',
    })
    mockLoadedMetricDefinitions()

    renderRoute('/metrics')

    await screen.findByRole('heading', {
      level: 1,
      name: /metrics/i,
    })

    expect(
      screen.queryByRole('button', { name: /edit resting heart rate/i }),
    ).not.toBeInTheDocument()
  })

  it('deactivates a custom metric from the metrics catalog', async () => {
    const user = userEvent.setup()

    vi.mocked(getMe).mockResolvedValue({
      email: 'user@example.com',
    })
    mockLoadedMetricDefinitions([
      {
        id: 'default-metric-id',
        name: 'Resting Heart Rate',
        slug: 'resting_hr',
        unit: 'bpm',
        category: 'cardiovascular',
        min_value: 20,
        max_value: 220,
        is_default: true,
        is_active: true,
      },
      {
        id: 'custom-metric-id',
        name: 'Mood',
        slug: 'mood',
        unit: 'score',
        category: 'custom',
        min_value: 1,
        max_value: 10,
        is_default: false,
        is_active: true,
      },
    ])

    renderRoute('/metrics')

    await screen.findByRole('heading', {
      level: 1,
      name: /metrics/i,
    })

    await user.click(screen.getByRole('button', { name: /deactivate mood/i }))

    expect(deactivateMetricDefinitionMutateAsyncMock).toHaveBeenCalledWith(
      'custom-metric-id',
    )
    expect(
      screen.queryByRole('button', {
        name: /deactivate resting heart rate/i,
      }),
    ).not.toBeInTheDocument()
  })

  it('shows an error when custom metric deactivation fails', async () => {
    const user = userEvent.setup()

    vi.mocked(getMe).mockResolvedValue({
      email: 'user@example.com',
    })
    mockLoadedMetricDefinitions([
      {
        id: 'custom-metric-id',
        name: 'Mood',
        slug: 'mood',
        unit: 'score',
        category: 'custom',
        min_value: 1,
        max_value: 10,
        is_default: false,
        is_active: true,
      },
    ])
    deactivateMetricDefinitionMutateAsyncMock.mockRejectedValueOnce(
      new Error('Metric definition request failed'),
    )

    renderRoute('/metrics')

    await screen.findByRole('heading', {
      level: 1,
      name: /metrics/i,
    })

    await user.click(screen.getByRole('button', { name: /deactivate mood/i }))

    expect(
      await screen.findByText(/metric definition request failed/i),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /edit mood/i }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /deactivate mood/i }),
    ).toBeInTheDocument()
  })

 it('loads active metric definitions by default', async () => {
    vi.mocked(getMe).mockResolvedValue({
      email: 'user@example.com',
    })
    mockLoadedMetricDefinitions()

    renderRoute('/metrics')

    await screen.findByRole('heading', {
      level: 1,
      name: /metrics/i,
    })

    expect(useMetricDefinitionsQuery).toHaveBeenCalledWith({
      includeInactive: false,
    })
  })

  it('loads inactive custom metrics when requested', async () => {
    const user = userEvent.setup()

    vi.mocked(getMe).mockResolvedValue({
      email: 'user@example.com',
    })
    mockLoadedMetricDefinitions()

    renderRoute('/metrics')

    await screen.findByRole('heading', {
      level: 1,
      name: /metrics/i,
    })

    await user.click(
      screen.getByRole('button', { name: /show deactivated custom metrics/i }),
    )

    expect(useMetricDefinitionsQuery).toHaveBeenLastCalledWith({
      includeInactive: true,
    })
  })

})
