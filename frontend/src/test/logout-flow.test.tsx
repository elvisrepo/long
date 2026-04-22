import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createRouter, RouterProvider } from '@tanstack/react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { AuthBootstrapGate } from '../features/auth/auth-bootstrap-gate'
import { logoutWeb } from '../features/auth/auth-logout-api'
import { getMe } from '../features/auth/auth-me-api'
import { routeTree } from '../routeTree.gen'

vi.mock('../features/auth/auth-bootstrap', () => ({
  restoreWebSession: vi.fn().mockResolvedValue({ access: 'test-access-token' }),
}))

vi.mock('../features/auth/auth-logout-api', () => ({
  logoutWeb: vi.fn(),
}))

vi.mock('../features/auth/auth-me-api', () => ({
  getMe: vi.fn(),
}))

interface RenderLogoutFlowOptions {
  path?: string
  seedCurrentUser?: boolean
}

function renderLogoutFlow({
  path = '/settings',
  seedCurrentUser = true,
}: RenderLogoutFlowOptions = {}) {
  window.history.pushState({}, '', path)

  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  })

  if (seedCurrentUser) {
    queryClient.setQueryData(['me'], {
      email: 'user@example.com',
    })
  }

  const router = createRouter({
    routeTree,
    context: {
      queryClient,
    },
  })

  render(
    <QueryClientProvider client={queryClient}>
      <AuthBootstrapGate>
        <RouterProvider router={router} />
      </AuthBootstrapGate>
    </QueryClientProvider>,
  )
}

describe('logout flow', () => {
  afterEach(() => {
    vi.resetAllMocks()
  })

  it('logs out and redirects to /login', async () => {
    const user = userEvent.setup()

    vi.mocked(logoutWeb).mockResolvedValue()
    vi.mocked(getMe).mockRejectedValue(
      new Error('Authentication credentials were not provided.'),
    )

    renderLogoutFlow()

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

    renderLogoutFlow()

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
    vi.mocked(getMe).mockRejectedValue(
      new Error('Authentication credentials were not provided.'),
    )

    renderLogoutFlow()

    await user.click(await screen.findByRole('button', { name: /logout/i }))

    expect(
      await screen.findByRole('heading', { name: /login/i }),
    ).toBeInTheDocument()

    await user.click(screen.getByRole('link', { name: /settings/i }))

    expect(
      await screen.findByRole('heading', { name: /login/i }),
    ).toBeInTheDocument()
  })

  it('re-fetches current user after logout when revisiting a protected route', async () => {
    const user = userEvent.setup()

    vi.mocked(logoutWeb).mockResolvedValue()
    vi.mocked(getMe)
      .mockResolvedValueOnce({
        email: 'user@example.com',
      })
      .mockResolvedValueOnce({
        email: 'user@example.com',
      })
      .mockRejectedValue(new Error('Authentication credentials were not provided.'))

    renderLogoutFlow({ seedCurrentUser: false })

    expect(
      await screen.findByRole('heading', { name: /settings/i }),
    ).toBeInTheDocument()

    const callsBeforeLogout = vi.mocked(getMe).mock.calls.length
    expect(callsBeforeLogout).toBeGreaterThan(0)

    await user.click(screen.getByRole('button', { name: /logout/i }))

    expect(
      await screen.findByRole('heading', { name: /login/i }),
    ).toBeInTheDocument()

    await user.click(screen.getByRole('link', { name: /settings/i }))

    expect(
      await screen.findByRole('heading', { name: /login/i }),
    ).toBeInTheDocument()

    expect(vi.mocked(getMe).mock.calls.length).toBeGreaterThan(callsBeforeLogout)
  })
})
