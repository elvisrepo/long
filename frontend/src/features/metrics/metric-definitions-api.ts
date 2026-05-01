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

    const response = await fetch('/api/v1/metrics/definitions/', {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    })

    return response.json() as Promise<MetricDefinition[]>
  }