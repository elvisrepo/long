import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createRouter, RouterProvider } from '@tanstack/react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { AuthBootstrapGate } from '../features/auth/auth-bootstrap-gate'
import { logoutWeb } from '../features/auth/auth-logout-api'
import { useMeQuery } from '../features/auth/use-me-query'
import { routeTree } from '../routeTree.gen'

vi.mock('../features/auth/auth-bootstrap', () => ({
    restoreWebSession: vi.fn().mockResolvedValue({ access: 'test-access-token' }),
  }))

 vi.mock('../features/auth/auth-logout-api', () => ({
    logoutWeb: vi.fn(),
  }))

vi.mock('../features/auth/use-me-query', () => ({
    useMeQuery: vi.fn(),
  }))

describe('logout flow', () => {
    afterEach(() => {
      vi.resetAllMocks()
    })

    it('logs out and redirects to /login', async () => {
      const user = userEvent.setup()

      vi.mocked(logoutWeb).mockResolvedValue()

      vi.mocked(useMeQuery).mockReturnValue({
        isLoading: false,
        isError: false,
        isSuccess: true,
        data: {
          email: 'user@example.com',
        },
        error: null,
      } as ReturnType<typeof useMeQuery>)

      window.history.pushState({}, '', '/settings')

      const queryClient = new QueryClient({
        defaultOptions: {
          queries: {
            retry: false,
          },
        },
      })

      const router = createRouter({ routeTree })

      render(
        <QueryClientProvider client={queryClient}>
          <AuthBootstrapGate>
            <RouterProvider router={router} />
          </AuthBootstrapGate>
        </QueryClientProvider>,
      )

      await user.click(await screen.findByRole('button', { name: /logout/i }))

      await waitFor(() => {
        expect(logoutWeb).toHaveBeenCalledTimes(1)
      })

      expect(
        await screen.findByRole('heading', { name: /login/i }),
      ).toBeInTheDocument()
    })

     it('shows an error and stays on settings when logout fails', async () => {
    const user = userEvent.setup()

    vi.mocked(logoutWeb).mockRejectedValue(new Error('Token is invalid.'))

    vi.mocked(useMeQuery).mockReturnValue({
      isLoading: false,
      isError: false,
      isSuccess: true,
      data: {
        email: 'user@example.com',
      },
      error: null,
    } as ReturnType<typeof useMeQuery>)

    window.history.pushState({}, '', '/settings')

    const queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    })

    const router = createRouter({ routeTree })

    render(
      <QueryClientProvider client={queryClient}>
        <AuthBootstrapGate>
          <RouterProvider router={router} />
        </AuthBootstrapGate>
      </QueryClientProvider>,
    )

    await user.click(await screen.findByRole('button', { name: /logout/i }))

    expect(
      await screen.findByText(/token is invalid\./i),
    ).toBeInTheDocument()

    expect(
      screen.getByRole('heading', { name: /settings/i }),
    ).toBeInTheDocument()
  })

  it('does not allow returning to settings after successful logout', async () => {
    const user = userEvent.setup()

    vi.mocked(logoutWeb).mockResolvedValue()

    vi.mocked(useMeQuery)
      .mockReturnValueOnce({
        isLoading: false,
        isError: false,
        isSuccess: true,
        data: {
          email: 'user@example.com',
        },
        error: null,
      } as ReturnType<typeof useMeQuery>)
      .mockReturnValue({
        isLoading: false,
        isError: true,
        isSuccess: false,
        data: undefined,
        error: new Error('Authentication credentials were not provided.'),
      } as ReturnType<typeof useMeQuery>)

    window.history.pushState({}, '', '/settings')

    const queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    })

    const router = createRouter({ routeTree })

    render(
      <QueryClientProvider client={queryClient}>
        <AuthBootstrapGate>
          <RouterProvider router={router} />
        </AuthBootstrapGate>
      </QueryClientProvider>,
    )

    await user.click(await screen.findByRole('button', { name: /logout/i }))

    expect(
      await screen.findByRole('heading', { name: /login/i }),
    ).toBeInTheDocument()

    await user.click(screen.getByRole('link', { name: /settings/i }))

    expect(
      await screen.findByRole('heading', { name: /login/i }),
    ).toBeInTheDocument()
  })

  })