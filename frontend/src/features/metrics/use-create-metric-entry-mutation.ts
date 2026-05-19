import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  createMetricEntry,
  type CreateMetricEntryInput,
  type MetricEntry,
} from './metric-entries-api'

export function useCreateMetricEntryMutation() {
  const queryClient = useQueryClient()

  return useMutation<MetricEntry, Error, CreateMetricEntryInput>({
    mutationFn: (input) => createMetricEntry(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['metric-entries'] })
    },
  })
}
