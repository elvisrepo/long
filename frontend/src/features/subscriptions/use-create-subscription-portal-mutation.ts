import { useMutation } from "@tanstack/react-query";

import {
    createSubscriptionPortal,
    type SubscriptionPortal,
  } from './subscriptions-api'

export function useCreateSubscriptionPortalMutation() {
    return useMutation<SubscriptionPortal, Error>({
      mutationFn: createSubscriptionPortal,
    })
  }