import { useQuery } from "@tanstack/react-query";
import {
  getCurrentSubscription,
  type CurrentSubscription,
} from "./subscriptions-api";

export function hasPaidPlan(subscription: CurrentSubscription | undefined): boolean {
  return (
    subscription !== undefined &&
    subscription.plan.code !== "free" &&
    (subscription.status === "active" || subscription.status === "trialing")
  );
}

export function useCurrentSubscriptionQuery(
  { confirmCheckout = false }: { confirmCheckout?: boolean } = {},
) {
  return useQuery<CurrentSubscription>({
    queryKey: ["current-subscription"],
    queryFn: getCurrentSubscription,
    refetchOnMount: confirmCheckout ? "always" : true,
    refetchInterval: confirmCheckout
      ? (query) => (hasPaidPlan(query.state.data) ? false : 2000)
      : false,
  });
}
