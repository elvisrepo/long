import { beforeEach, describe, expect, it, vi } from 'vitest'
import { setAccessToken } from '../auth/auth-session'
import { createMetricEntry , getMetricEntries } from './metric-entries-api'

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

it('rejects without an access token', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')

    await expect(
      createMetricEntry({
        metricDefinition: 'resting_hr',
        value: 58,
        recordedAt: '2026-03-05T07:15:00Z',
      }),
    ).rejects.toThrow('Authentication required')

    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('throws when the backend rejects the metric entry', async () => {
    setAccessToken('access-token')

    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
    } as Response)

    await expect(
      createMetricEntry({
        metricDefinition: 'resting_hr',
        value: 500,
        recordedAt: '2026-03-05T07:15:00Z',
      }),
    ).rejects.toThrow('Metric entry failed to save')
  })

})


describe('getMetricEntries', () => {
    beforeEach(() => {
      setAccessToken(null)
      vi.restoreAllMocks()
    })

    it('fetches metric entries with optional filters and the access token', async () => {
      setAccessToken('access-token')

      const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        json: async () => [
          {
            id: 1,
            metric_definition: 'resting_hr',
            value: 58,
            recorded_at: '2026-03-05T07:15:00Z',
            source: 'manual',
            context: {},
            created_at: '2026-03-05T07:15:02Z',
          },
        ],
      } as Response)

      const result = await getMetricEntries({
        metric: 'resting_hr',
        from: '2026-03-01T00:00:00Z',
        to: '2026-03-31T23:59:59Z',
      })

      expect(fetchMock).toHaveBeenCalledWith(
        '/api/v1/metrics/entries/?metric=resting_hr&from=2026-03-01T00%3A00%3A00Z&to=2026-03-31T23%3A59%3A59Z',
        {
          method: 'GET',
          headers: {
            Authorization: 'Bearer access-token',
          },
        },
      )

      expect(result).toEqual([
        {
          id: 1,
          metric_definition: 'resting_hr',
          value: 58,
          recorded_at: '2026-03-05T07:15:00Z',
          source: 'manual',
          context: {},
          created_at: '2026-03-05T07:15:02Z',
        },
      ])
    })
  })
