import { beforeEach, describe, expect, it, vi } from 'vitest'
import { clearAccessToken, setAccessToken } from '../auth/auth-session'
 import {
    createMetricEntry,
    deleteMetricEntry,
    getMetricEntries,
    updateMetricEntry,
  } from './metric-entries-api'

describe('createMetricEntry', () => {
  beforeEach(() => {
    clearAccessToken()
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
    clearAccessToken()
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

  it('rejects without an access token', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')

    await expect(getMetricEntries()).rejects.toThrow('Authentication required')

    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('throws when metric entries fail to load', async () => {
    setAccessToken('access-token')

    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
    } as Response)

    await expect(getMetricEntries()).rejects.toThrow(
      'Metric entries failed to load',
    )
  })

  it('sends a limit query parameter when provided', async () => {
    setAccessToken('access-token')

    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => [],
    } as Response)

    await getMetricEntries({
      metric: 'resting_hr',
      limit: 2,
    })

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/metrics/entries/?metric=resting_hr&limit=2',
      {
        method: 'GET',
        headers: {
          Authorization: 'Bearer access-token',
        },
      },
    )
  })
})


describe('updateMetricEntry', () => {
    beforeEach(() => {
      clearAccessToken()
      vi.restoreAllMocks()
    })

    it('patches a metric entry with the access token', async () => {
      setAccessToken('access-token')

      const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        json: async () => ({
          id: 1,
          metric_definition: 'resting_hr',
          value: 62,
          recorded_at: '2026-03-06T08:30:00Z',
          source: 'manual',
          context: { notes: 'after walk' },
          created_at: '2026-03-05T07:15:02Z',
        }),
      } as Response)

      const result = await updateMetricEntry(1, {
        value: 62,
        recordedAt: '2026-03-06T08:30:00Z',
        context: { notes: 'after walk' },
      })

      expect(fetchMock).toHaveBeenCalledWith('/api/v1/metrics/entries/1/', {
        method: 'PATCH',
        headers: {
          Authorization: 'Bearer access-token',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          value: 62,
          recorded_at: '2026-03-06T08:30:00Z',
          context: { notes: 'after walk' },
        }),
      })

      expect(result).toEqual({
        id: 1,
        metric_definition: 'resting_hr',
        value: 62,
        recorded_at: '2026-03-06T08:30:00Z',
        source: 'manual',
        context: { notes: 'after walk' },
        created_at: '2026-03-05T07:15:02Z',
      })
    })

    it('rejects without an access token', async () => {
      const fetchMock = vi.spyOn(globalThis, 'fetch')

      await expect(
        updateMetricEntry(1, {
          value: 62,
        }),
      ).rejects.toThrow('Authentication required')

      expect(fetchMock).not.toHaveBeenCalled()
    })

    it('throws when the backend rejects the update', async () => {
      setAccessToken('access-token')

      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: false,
      } as Response)

      await expect(
        updateMetricEntry(1, {
          value: 500,
        }),
      ).rejects.toThrow('Metric entry failed to update')
    })
  })

  describe('deleteMetricEntry', () => {
    beforeEach(() => {
      clearAccessToken()
      vi.restoreAllMocks()
    })

    it('deletes a metric entry with the access token', async () => {
      setAccessToken('access-token')

      const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
      } as Response)

      await deleteMetricEntry(1)

      expect(fetchMock).toHaveBeenCalledWith('/api/v1/metrics/entries/1/', {
        method: 'DELETE',
        headers: {
          Authorization: 'Bearer access-token',
        },
      })
    })

    it('rejects without an access token', async () => {
      const fetchMock = vi.spyOn(globalThis, 'fetch')

      await expect(deleteMetricEntry(1)).rejects.toThrow(
        'Authentication required',
      )

      expect(fetchMock).not.toHaveBeenCalled()
    })

    it('throws when the backend rejects the delete', async () => {
      setAccessToken('access-token')

      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: false,
      } as Response)

      await expect(deleteMetricEntry(1)).rejects.toThrow(
        'Metric entry failed to delete',
      )
    })
  })