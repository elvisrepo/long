import { getAccessToken } from "../auth/auth-session";

export interface MetricDefinition {
    id: string
    name: string
    slug: string
    unit: string
    category: string
    min_value: number
    max_value: number
    is_default: boolean
  }

 export async function getMetricDefinitions(): Promise<MetricDefinition[]> {
    const accessToken = getAccessToken()

    if (!accessToken) {
      throw new Error('Authentication required')
    }

    const response = await fetch('/api/v1/metrics/definitions/', {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    })

    if (!response.ok) {
      throw new Error('Metric definitions failed to load')
    }

    return response.json() as Promise<MetricDefinition[]>
  }