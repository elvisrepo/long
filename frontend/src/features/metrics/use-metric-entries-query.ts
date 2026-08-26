import { useQuery } from "@tanstack/react-query";
import {
  getMetricEntries,
  type GetMetricEntriesFilters,
  type MetricEntry,
} from "./metric-entries-api";

export function useMetricEntriesQuery(filters: GetMetricEntriesFilters = {}) {
  return useQuery<MetricEntry[]>({
    // Filters are part of the cache key so each metric/date-range query gets
    // its own cached result instead of reusing another list.
    // a query for resting_hr and a query for mood are cached separately instead of sharing one stale list.
    queryKey: ["metric-entries", filters],
    queryFn: () => getMetricEntries(filters),
  });
}
