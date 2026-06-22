import { useMutation } from '@tanstack/react-query'
import {
  createSubscriptionCheckout,
  type CreateSubscriptionCheckoutInput,
  type SubscriptionCheckout,
} from './subscriptions-api'

export function useCreateSubscriptionCheckoutMutation() {
  return useMutation<
    SubscriptionCheckout,
    Error,
    CreateSubscriptionCheckoutInput
  >({
    mutationFn: (input) => createSubscriptionCheckout(input),
  })
}
