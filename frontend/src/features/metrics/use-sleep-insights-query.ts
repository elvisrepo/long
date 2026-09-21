import { useQuery } from "@tanstack/react-query";

import { getSleepInsights, type SleepInsights } from "./sleep-insights-api";

export function useSleepInsightsQuery(targetMinutes: number) {
  return useQuery<SleepInsights>({
    queryKey: ["sleep-insights", targetMinutes],
    queryFn: () => getSleepInsights(targetMinutes),
  });
}
