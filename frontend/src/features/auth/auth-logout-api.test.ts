import { afterEach, describe, expect, it, vi } from 'vitest'
import { clearAccessToken } from './auth-session'

import { logoutWeb } from './auth-logout-api'

vi.mock('./auth-session', () => ({
    clearAccessToken: vi.fn(),
  }))

describe('logoutWeb', () => {
    afterEach(() => {
      vi.resetAllMocks()
      document.cookie = 'csrftoken=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/'
    })

    it('posts to the web logout endpoint with csrf and cookies', async () => {
      document.cookie = 'csrftoken=test-csrf-token'

      const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(null, {
          status: 204,
        }),
      )

      await logoutWeb()

      expect(fetchMock).toHaveBeenCalledWith('/api/auth/web/logout/', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'X-CSRFToken': 'test-csrf-token',
        },
      })
    })

    it('throws when the web logout response is not successful', async () => {
    document.cookie = 'csrftoken=test-csrf-token'

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ detail: 'Token is invalid.' }), {
        status: 400,
        headers: {
          'Content-Type': 'application/json',
        },
      }),
    )

    await expect(logoutWeb()).rejects.toThrow('Token is invalid.')
  })

  it('clears the access token after a successful logout', async () => {
    document.cookie = 'csrftoken=test-csrf-token'

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(null, {
        status: 204,
      }),
    )

    await logoutWeb()

    expect(clearAccessToken).toHaveBeenCalledTimes(1)
  })
  })