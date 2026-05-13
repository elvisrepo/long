import { screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { restoreWebSession } from '../features/auth/auth-bootstrap'
import { getMe } from '../features/auth/auth-me-api'
import { useMetricDefinitionsQuery } from '../features/metrics/use-metric-definitions-query'
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

describe('dashboard route', () => {
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

    renderRoute('/')

    expect(
      await screen.findByText(/metric definitions failed to load/i),
    ).toBeInTheDocument()
  })


})
