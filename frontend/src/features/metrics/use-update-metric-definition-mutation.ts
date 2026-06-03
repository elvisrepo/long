import { useMutation, useQueryClient } from '@tanstack/react-query'

import {
  type MetricDefinition,
  type UpdateMetricDefinitionInput,
  updateMetricDefinition,
} from './metric-definitions-api'

interface UpdateMetricDefinitionMutationInput {
  id: string
  input: UpdateMetricDefinitionInput
}

export function useUpdateMetricDefinitionMutation() {
  const queryClient = useQueryClient()

  return useMutation<
    MetricDefinition,
    Error,
    UpdateMetricDefinitionMutationInput
  >({
    mutationFn: ({ id, input }) => updateMetricDefinition(id, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['metric-definitions'] })
    },
  })
}
