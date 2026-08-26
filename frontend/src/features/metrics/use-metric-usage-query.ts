import { useQuery } from "@tanstack/react-query";

import { getMetricUsage, type MetricUsage } from "./metric-usage-api";

export function useMetricUsageQuery() {
  return useQuery<MetricUsage>({
    queryKey: ["metric-usage"],
    queryFn: getMetricUsage,
  });
}
