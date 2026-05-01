import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import { clearAccessToken, setAccessToken } from '../auth/auth-session'
import { getMetricDefinitions } from './metric-definitions-api'


describe('getMetricDefinitions', () => {
    beforeEach(() => {
      vi.stubGlobal('fetch', vi.fn())
      setAccessToken('access-token')
    })

    afterEach(() => {
      vi.unstubAllGlobals()
      clearAccessToken()
    })

    test('fetches metric definitions with the stored access token', async () => {
      vi.mocked(fetch).mockResolvedValueOnce(
        new Response(
          JSON.stringify([
            {
              id: 'metric-id',
              name: 'Resting Heart Rate',
              slug: 'resting_hr',
              unit: 'bpm',
              category: 'cardiovascular',
              min_value: 20,
              max_value: 220,
              is_default: true,
            },
          ]),
          { status: 200 },
        ),
      )

      const result = await getMetricDefinitions()

      expect(fetch).toHaveBeenCalledWith('/api/v1/metrics/definitions/', {
        method: 'GET',
        headers: {
          Authorization: 'Bearer access-token',
        },
      })
      expect(result).toEqual([
        {
          id: 'metric-id',
          name: 'Resting Heart Rate',
          slug: 'resting_hr',
          unit: 'bpm',
          category: 'cardiovascular',
          min_value: 20,
          max_value: 220,
          is_default: true,
        },
      ])
    })
  })