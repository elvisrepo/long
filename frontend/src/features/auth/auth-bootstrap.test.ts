 import { afterEach, describe, expect, it, vi } from 'vitest'

  vi.mock('./auth-session', () => ({
    setAccessToken: vi.fn(),
  }))

  import { setAccessToken } from './auth-session'
  import { restoreWebSession } from './auth-bootstrap'

  describe('restoreWebSession', () => {
    afterEach(() => {
      vi.restoreAllMocks()
      document.cookie = 'csrftoken=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/'
    })

    it('bootstraps csrf, refreshes the web session, and stores the access token', async () => {
      document.cookie = 'csrftoken=test-csrf-token'

      const fetchMock = vi
        .spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce(new Response(null, { status: 200 }))
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ access: 'test-access-token' }), {
            status: 200,
            headers: {
              'Content-Type': 'application/json',
            },
          }),
        )

      const result = await restoreWebSession()

      expect(fetchMock).toHaveBeenNthCalledWith(1, '/api/auth/csrf/', {
        method: 'GET',
        credentials: 'include',
      })

      expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/auth/web/refresh/', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'X-CSRFToken': 'test-csrf-token',
        },
      })

      expect(setAccessToken).toHaveBeenCalledWith('test-access-token')
      expect(result).toEqual({
        access: 'test-access-token',
      })
    })
  })