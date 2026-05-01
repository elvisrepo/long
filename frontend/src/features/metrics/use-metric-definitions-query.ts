import { useQuery } from "@tanstack/react-query";

  import {
    getMetricDefinitions,
    type MetricDefinition,
  } from './metric-definitions-api'

 export function useMetricDefinitionsQuery() {
    return useQuery<MetricDefinition[]> ({
        // Shared cache key for all dashboard reads of the metric definition list.
        queryKey: ['metric-definitions'],
        queryFn: getMetricDefinitions,
    })
 }
