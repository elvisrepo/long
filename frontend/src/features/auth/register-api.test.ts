 import { afterEach, describe, expect, it, vi } from 'vitest'

import { registerWeb } from './register-api'

describe('registerWeb', () => {
    afterEach(() => {
      vi.restoreAllMocks()
    })

    it('posts registration data to the register endpoint', async () => {
      const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(null, {
          status: 201,
        }),
      )

      await registerWeb({
        email: 'user@example.com',
        password: 'secret123',
      })

      expect(fetchMock).toHaveBeenCalledWith('/api/auth/register/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: 'user@example.com',
          password: 'secret123',
        }),
      })
    })

    it('preserves backend error detail when registration fails', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          detail: 'A user with this email already exists.',
        }),
        {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
          },
        },
      ),
    )

    await expect(
      registerWeb({
        email: 'user@example.com',
        password: 'secret123',
      }),
    ).rejects.toThrow('A user with this email already exists.')
  })
  })