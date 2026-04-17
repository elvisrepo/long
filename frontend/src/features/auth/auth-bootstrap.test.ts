 import { afterEach, describe, expect, it, vi } from 'vitest'

  vi.mock('./auth-session', () => ({
    setAccessToken: vi.fn(),
    clearAccessToken: vi.fn(),
  }))

  import { clearAccessToken, setAccessToken } from './auth-session'
  import { restoreWebSession } from './auth-bootstrap'

  describe('restoreWebSession', () => {
    afterEach(() => {
        vi.resetAllMocks()
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

    it('clears auth state and throws when web refresh fails', async () => {
    document.cookie = 'csrftoken=test-csrf-token'

    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ detail: 'Token is invalid.' }), {
          status: 401,
          headers: {
            'Content-Type': 'application/json',
          },
        }),
      )

    await expect(restoreWebSession()).rejects.toThrow('Token is invalid.')

    expect(clearAccessToken).toHaveBeenCalledTimes(1)
    expect(setAccessToken).not.toHaveBeenCalled()
  })

  it('clears auth state and throws when csrf bootstrap fails', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(null, {
        status: 500,
      }),
    )

    await expect(restoreWebSession()).rejects.toThrow('Session restore failed')

    expect(clearAccessToken).toHaveBeenCalledTimes(1)
    expect(setAccessToken).not.toHaveBeenCalled()
  })
  })