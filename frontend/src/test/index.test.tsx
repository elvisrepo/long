import { screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { useMeQuery } from '../features/auth/use-me-query'
import { renderRoute } from './render-route'

vi.mock('../features/auth/use-me-query', () => ({
  useMeQuery: vi.fn(),
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
})
