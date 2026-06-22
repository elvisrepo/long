import { useQuery } from '@tanstack/react-query'
import {
  getSubscriptionPlans,
  type SubscriptionPlanCatalogItem,
} from './subscriptions-api'

export function useSubscriptionPlansQuery() {
  return useQuery<SubscriptionPlanCatalogItem[]>({
    queryKey: ['subscription-plans'],
    queryFn: getSubscriptionPlans,
  })
}
