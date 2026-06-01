import { useMutation, useQueryClient } from '@tanstack/react-query'

import {
  type UpdateMetricEntryInput,
  updateMetricEntry,
} from './metric-entries-api'

interface UpdateMetricEntryMutationInput {
  id: number
  input: UpdateMetricEntryInput
}

export function useUpdateMetricEntryMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, input }: UpdateMetricEntryMutationInput) =>
      updateMetricEntry(id, input),
    onSuccess: () => {
      return queryClient.invalidateQueries({
        queryKey: ['metric-entries'],
      })
    },
  })
}
