import { render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('./auth-bootstrap', () => ({
  restoreWebSession: vi.fn(),
}))

import { restoreWebSession } from './auth-bootstrap'
import { AuthBootstrapGate } from './auth-bootstrap-gate'

describe('AuthBootstrapGate', () => {
  afterEach(() => {
    vi.resetAllMocks()
  })

  it('waits for session restore before rendering children', async () => {
    let resolveRestore: (() => void) | undefined

    vi.mocked(restoreWebSession).mockReturnValue(
      new Promise((resolve) => {
        resolveRestore = () => resolve(undefined as never)
      }),
    )

    render(
      <AuthBootstrapGate>
        <h1>App Ready</h1>
      </AuthBootstrapGate>,
    )

    expect(screen.getByText(/restoring session/i)).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: /app ready/i })).not.toBeInTheDocument()

    resolveRestore?.()

    await waitFor(() => {
      expect(
        screen.getByRole('heading', { name: /app ready/i }),
      ).toBeInTheDocument()
    })
  })

  it('still renders children when session restore fails', async () => {
    vi.mocked(restoreWebSession).mockRejectedValue(
      new Error('Token is invalid.'),
    )

    render(
      <AuthBootstrapGate>
        <h1>App Ready</h1>
      </AuthBootstrapGate>,
    )

    await waitFor(() => {
      expect(
        screen.getByRole('heading', { name: /app ready/i }),
      ).toBeInTheDocument()
    })
  })
})
