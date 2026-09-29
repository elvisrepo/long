import { useQueries } from "@tanstack/react-query";

import { getMetricEntries, type MetricEntry } from "./metric-entries-api";

const DASHBOARD_ENTRIES_PER_METRIC = 7;
const DAILY_PRESENTATION_METRICS = new Set(["hrv", "steps"]);

export function useDashboardMetricEntriesQuery(metricSlugs: string[]) {
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  const queries = useQueries({
    queries: metricSlugs.map((metric) => {
      const filters = {
        metric,
        limit: DASHBOARD_ENTRIES_PER_METRIC,
        ...(DAILY_PRESENTATION_METRICS.has(metric)
          ? { daily: true, timezone }
          : {}),
      };
      return {
        queryKey: ["metric-entries", filters],
        queryFn: () => getMetricEntries(filters),
      };
    }),
  });

  return {
    data: queries.flatMap((query) => query.data ?? []) as MetricEntry[],
    isLoading: queries.some((query) => query.isPending),
    isError: queries.some((query) => query.isError),
  };
}
