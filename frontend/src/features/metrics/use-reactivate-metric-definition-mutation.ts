 import { useMutation, useQueryClient } from '@tanstack/react-query'

  import {
    type MetricDefinition,
    updateMetricDefinition,
  } from './metric-definitions-api'

  export function useReactivateMetricDefinitionMutation() {
    const queryClient = useQueryClient()

    return useMutation<MetricDefinition, Error, string>({
      mutationFn: (id) =>
        updateMetricDefinition(id, {
          isActive: true,
        }),
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ['metric-definitions'] })
        queryClient.invalidateQueries({ queryKey: ['metric-entries'] })
      },
    })
  }