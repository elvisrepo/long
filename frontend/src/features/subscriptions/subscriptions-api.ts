import { getAccessToken } from '../auth/auth-session'

export interface SubscriptionPlan {
  code: string
  name: string
  active_custom_metric_limit: number
  wearable_connection_limit: number
  sync_interval_minutes: number
  analytics_enabled: boolean
  csv_import_enabled: boolean
}

export interface CurrentSubscription {
  id: string
  status: string
  plan: SubscriptionPlan
}

export interface SubscriptionPrice {
  id: string
  currency: string
  unit_amount: number
  billing_interval: string
}

export interface SubscriptionPlanCatalogItem extends SubscriptionPlan {
  is_default: boolean
  prices: SubscriptionPrice[]
}

export interface CreateSubscriptionCheckoutInput {
  priceId: string
}

export interface SubscriptionCheckout {
  url: string
}

export async function getCurrentSubscription(): Promise<CurrentSubscription> {
  const accessToken = getAccessToken()

  if (!accessToken) {
    throw new Error('Authentication required')
  }

  const response = await fetch('/api/v1/subscriptions/current/', {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  })

  if (!response.ok) {
    throw new Error('Current subscription failed to load')
  }

  return response.json()
}

export async function getSubscriptionPlans(): Promise<
  SubscriptionPlanCatalogItem[]
> {
  const response = await fetch('/api/v1/subscriptions/plans/', {
    method: 'GET',
  })

  if (!response.ok) {
    throw new Error('Subscription plans failed to load')
  }

  return response.json()
}

export async function createSubscriptionCheckout(
  input: CreateSubscriptionCheckoutInput,
): Promise<SubscriptionCheckout> {
  const accessToken = getAccessToken()

  if (!accessToken) {
    throw new Error('Authentication required')
  }

  const response = await fetch('/api/v1/subscriptions/checkout/', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    // Clients send our internal price UUID. Stripe Price IDs stay server-side.
    body: JSON.stringify({
      price_id: input.priceId,
    }),
  })

  if (!response.ok) {
    throw new Error(
      await readSubscriptionError(
        response,
        'Subscription checkout failed to start',
      ),
    )
  }

  return response.json()
}

async function readSubscriptionError(
  response: Response,
  fallback: string,
): Promise<string> {
  try {
    return formatSubscriptionError(await response.json()) ?? fallback
  } catch {
    return fallback
  }
}

function formatSubscriptionError(errorBody: unknown): string | undefined {
  if (typeof errorBody === 'string') {
    return errorBody
  }

  if (!errorBody || typeof errorBody !== 'object') {
    return undefined
  }

  const errorRecord = errorBody as Record<string, unknown>

  if (typeof errorRecord.detail === 'string') {
    return errorRecord.detail
  }

  for (const value of Object.values(errorRecord)) {
    if (typeof value === 'string') {
      return value
    }

    if (Array.isArray(value) && typeof value[0] === 'string') {
      return value[0]
    }
  }

  return undefined
}
