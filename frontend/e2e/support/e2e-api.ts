import { expect, type APIRequestContext } from '@playwright/test'

export async function resetE2eDatabase(request: APIRequestContext): Promise<void> {
    const response = await request.post('/api/testing/reset/')

    expect(response.status()).toBe(204)
  }