import { afterEach, describe, expect, it, vi } from 'vitest'

import { loginWeb } from './auth-api'

describe('loginWeb', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('posts credentials to the web login endpoint and returns the access token', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ access: 'test-access-token' }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
        },
      }),
    )

    const result = await loginWeb({
      email: 'user@example.com',
      password: 'secret123',
    })

    expect(fetchMock).toHaveBeenCalledWith('/api/auth/web/login/', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: 'user@example.com',
        password: 'secret123',
      }),
    })

    expect(result).toEqual({
      access: 'test-access-token',
    })
  })

  it('throws when the login response is not successful', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(null, {
        status: 401,
      }),
    )

    await expect(
      loginWeb({
        email: 'user@example.com',
        password: 'wrong-password',
      }),
    ).rejects.toThrow('Login failed')
  })

  it('preserves backend error detail when available', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify({ detail: 'Invalid credentials.' }), {
          status: 401,
          headers: {
            'Content-Type': 'application/json',
          },
        }),
      )

      await expect(
        loginWeb({
          email: 'user@example.com',
          password: 'wrong-password',
        }),
      ).rejects.toThrow('Invalid credentials.')
    })

    
})
