import { useQuery } from "@tanstack/react-query";

import { getConsistencyAnalytics } from "./consistency-analytics-api";

export function useConsistencyAnalyticsQuery() {
  return useQuery({
    queryKey: ["consistency-analytics"],
    queryFn: getConsistencyAnalytics,
  });
}
