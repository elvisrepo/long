import { getAccessToken } from '../auth/auth-session'

export interface MetricEntry {
  id: number
  metric_definition: string
  value: number
  recorded_at: string
  source: string
  context: Record<string, unknown>
  created_at: string
}

export interface CreateMetricEntryInput {
  metricDefinition: string
  value: number
  recordedAt: string
  context?: Record<string, unknown>
}

export interface GetMetricEntriesFilters {
    metric?: string
    from?: string
    to?: string
  }

export async function createMetricEntry(
  input: CreateMetricEntryInput,
): Promise<MetricEntry> {
  const accessToken = getAccessToken()

  if (!accessToken) {
    throw new Error('Authentication required')
  }

  const response = await fetch('/api/v1/metrics/entries/', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    // maps frontend-friendly camelCase input to the backend’s snake_case JSON contract
    body: JSON.stringify({
      metric_definition: input.metricDefinition,
      value: input.value,
      recorded_at: input.recordedAt,
      context: input.context ?? {},
    }),
  })

  if (!response.ok) {
    throw new Error('Metric entry failed to save')
  }

  return response.json()
}


export async function getMetricEntries(
    filters: GetMetricEntriesFilters = {},
  ): Promise<MetricEntry[]> {
    const accessToken = getAccessToken()

    if (!accessToken) {
      throw new Error('Authentication required')
    }

    const searchParams = new URLSearchParams()

    if (filters.metric) {
      searchParams.set('metric', filters.metric)
    }

    if (filters.from) {
      searchParams.set('from', filters.from)
    }

    if (filters.to) {
      searchParams.set('to', filters.to)
    }

    const queryString = searchParams.toString()
    const url = queryString
      ? `/api/v1/metrics/entries/?${queryString}`
      : '/api/v1/metrics/entries/'

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    })

    if (!response.ok) {
      throw new Error('Metric entries failed to load')
    }

    return response.json()
  }


   