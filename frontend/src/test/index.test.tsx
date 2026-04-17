import { screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { restoreWebSession } from '../features/auth/auth-bootstrap'
import { useMeQuery } from '../features/auth/use-me-query'
import { renderRoute } from './render-route'

vi.mock('../features/auth/use-me-query', () => ({
  useMeQuery: vi.fn(),
}))

vi.mock('../features/auth/auth-bootstrap', () => ({
  restoreWebSession: vi.fn().mockResolvedValue({ access: 'test-access-token' }),
}))

describe('dashboard route', () => {
  afterEach(() => {
    vi.resetAllMocks()
  })

  it('renders the dashboard for an authenticated user', async () => {
    vi.mocked(useMeQuery).mockReturnValue({
      isLoading: false,
      isError: false,
      isSuccess: true,
      data: {
        email: 'user@example.com',
      },
      error: null,
    } as ReturnType<typeof useMeQuery>)

    renderRoute('/')

    expect(
      await screen.findByRole('heading', { name: /dashboard/i }),
    ).toBeInTheDocument()
  })

  it('redirects to /login when the user is not authenticated', async () => {
    vi.mocked(useMeQuery).mockReturnValue({
      isLoading: false,
      isError: true,
      isSuccess: false,
      data: undefined,
      error: new Error('Authentication credentials were not provided.'),
    } as ReturnType<typeof useMeQuery>)

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

    vi.mocked(useMeQuery).mockReturnValue({
      isLoading: false,
      isError: false,
      isSuccess: true,
      data: {
        email: 'user@example.com',
      },
      error: null,
    } as ReturnType<typeof useMeQuery>)

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
})
