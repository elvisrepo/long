import { useMutation, useQueryClient } from "@tanstack/react-query";

import {
  type MetricDefinition,
  updateMetricDefinition,
} from "./metric-definitions-api";

export function useDeactivateMetricDefinitionMutation() {
  const queryClient = useQueryClient();

  return useMutation<MetricDefinition, Error, string>({
    mutationFn: (id) =>
      updateMetricDefinition(id, {
        isActive: false,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["metric-definitions"] });
      queryClient.invalidateQueries({ queryKey: ["metric-entries"] });
      queryClient.invalidateQueries({ queryKey: ["metric-usage"] });
    },
  });
}
