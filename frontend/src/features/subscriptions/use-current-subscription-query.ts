import { useQuery } from '@tanstack/react-query'
import {
    getCurrentSubscription,
    type CurrentSubscription,
  } from './subscriptions-api'

export function useCurrentSubscriptionQuery() {
    return useQuery<CurrentSubscription>({
      queryKey: ['current-subscription'],
      queryFn: getCurrentSubscription,
    })
  }