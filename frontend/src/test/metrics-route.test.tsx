import { screen, waitFor } from '@testing-library/react'
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

})
