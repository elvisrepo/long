import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  createMetricDefinition,
  type CreateMetricDefinitionInput,
  type MetricDefinition,
} from './metric-definitions-api'

export function useCreateMetricDefinitionMutation() {
  const queryClient = useQueryClient()

  return useMutation<MetricDefinition, Error, CreateMetricDefinitionInput>({
    mutationFn: (input) => createMetricDefinition(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['metric-definitions'] })
      queryClient.invalidateQueries({ queryKey: ['metric-usage'] })
    },
  })
}
