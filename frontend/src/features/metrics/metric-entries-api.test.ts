import { beforeEach, describe, expect, it, vi } from 'vitest'
import { setAccessToken } from '../auth/auth-session'
import { createMetricEntry } from './metric-entries-api'

describe('createMetricEntry', () => {
  beforeEach(() => {
    setAccessToken(null)
    vi.restoreAllMocks()
  })

  it('posts a manual metric entry with the access token', async () => {
    setAccessToken('access-token')

    // Mock fetch so this remains a frontend API-helper contract test, not an
    // integration test that depends on a running Django backend.
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        id: 1,
        metric_definition: 'resting_hr',
        value: 58,
        recorded_at: '2026-03-05T07:15:00Z',
        source: 'manual',
        context: { notes: 'morning measurement' },
        created_at: '2026-03-05T07:15:02Z',
      }),
    } as Response)

    const result = await createMetricEntry({
      metricDefinition: 'resting_hr',
      value: 58,
      recordedAt: '2026-03-05T07:15:00Z',
      context: { notes: 'morning measurement' },
    })

    expect(fetchMock).toHaveBeenCalledWith('/api/v1/metrics/entries/', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer access-token',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        metric_definition: 'resting_hr',
        value: 58,
        recorded_at: '2026-03-05T07:15:00Z',
        context: { notes: 'morning measurement' },
      }),
    })

    expect(result).toEqual({
      id: 1,
      metric_definition: 'resting_hr',
      value: 58,
      recorded_at: '2026-03-05T07:15:00Z',
      source: 'manual',
      context: { notes: 'morning measurement' },
      created_at: '2026-03-05T07:15:02Z',
    })
  })
})
