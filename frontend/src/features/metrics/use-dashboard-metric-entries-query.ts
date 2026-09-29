import { useQueries } from "@tanstack/react-query";

import { getMetricEntries, type MetricEntry } from "./metric-entries-api";

const DASHBOARD_ENTRIES_PER_METRIC = 7;
const DASHBOARD_RAW_ENTRY_LIMIT = 50;
const DAILY_PRESENTATION_METRICS = new Set(["hrv", "steps"]);

export function useDashboardMetricEntriesQuery(metricSlugs: string[]) {
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  const uniqueMetricSlugs = [...new Set(metricSlugs)];
  const queries = useQueries({
    queries: uniqueMetricSlugs.map((metric) => {
      const filters = DAILY_PRESENTATION_METRICS.has(metric)
        ? {
            metric,
            limit: DASHBOARD_ENTRIES_PER_METRIC,
            daily: true,
            timezone,
          }
        : { metric, limit: DASHBOARD_RAW_ENTRY_LIMIT };
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
