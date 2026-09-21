import { useQuery } from "@tanstack/react-query";

import {
  getWeightStepsAnalytics,
  type WeightStepsAnalytics,
  type WeightStepsRange,
} from "./weight-steps-analytics-api";

export function useWeightStepsAnalyticsQuery(days: WeightStepsRange) {
  return useQuery<WeightStepsAnalytics>({
    queryKey: ["weight-steps-analytics", days],
    queryFn: () => getWeightStepsAnalytics(days),
  });
}
