import { useMutation, useQueryClient } from "@tanstack/react-query";

import { deleteMetricEntry } from "./metric-entries-api";

export function useDeleteMetricEntryMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) => deleteMetricEntry(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["consistency-analytics"] });
      return queryClient.invalidateQueries({ queryKey: ["metric-entries"] });
    },
  });
}
