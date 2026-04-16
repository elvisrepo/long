import { afterEach, describe, expect, it, vi } from 'vitest'
  import { screen } from '@testing-library/react'

  vi.mock('../features/auth/use-me-query', () => ({
    useMeQuery: vi.fn(),
  }))

  import { useMeQuery } from '../features/auth/use-me-query'
  import { renderRoute } from './render-route'

  describe('settings route', () => {
    afterEach(() => {
      vi.resetAllMocks()
    })

    it('redirects to /login when the user is not authenticated', async () => {
      vi.mocked(useMeQuery).mockReturnValue({
        isLoading: false,
        isError: true,
        isSuccess: false,
        data: undefined,
        error: new Error('Authentication credentials were not provided.'),
      } as ReturnType<typeof useMeQuery>)

      renderRoute('/settings')

      expect(
        await screen.findByRole('heading', { name: /login/i }),
      ).toBeInTheDocument()
    })

    it('renders settings for an authenticated user', async () => {
    vi.mocked(useMeQuery).mockReturnValue({
      isLoading: false,
      isError: false,
      isSuccess: true,
      data: {
        email: 'user@example.com',
      },
      error: null,
    } as ReturnType<typeof useMeQuery>)

    renderRoute('/settings')

    expect(
      await screen.findByRole('heading', { name: /settings/i }),
    ).toBeInTheDocument()

    expect(
      screen.getByText(/signed in as user@example.com/i),
    ).toBeInTheDocument()
  })
  })