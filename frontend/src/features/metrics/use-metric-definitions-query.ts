import { useQuery } from "@tanstack/react-query";

import {
  getMetricDefinitions,
  type GetMetricDefinitionsOptions,
  type MetricDefinition,
} from './metric-definitions-api'

export function useMetricDefinitionsQuery(
  options: GetMetricDefinitionsOptions = {},
) {
  return useQuery<MetricDefinition[]>({
    queryKey: ['metric-definitions', options],
    queryFn: () => getMetricDefinitions(options),
  })
}
