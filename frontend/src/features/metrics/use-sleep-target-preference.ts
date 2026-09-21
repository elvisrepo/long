import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  getSleepTargetPreference,
  type SleepTargetPreference,
  updateSleepTargetPreference,
} from "./sleep-target-preference-api";

const sleepTargetPreferenceKey = ["sleep-target-preference"] as const;

export function useSleepTargetPreferenceQuery() {
  return useQuery({
    queryKey: sleepTargetPreferenceKey,
    queryFn: getSleepTargetPreference,
  });
}

export function useUpdateSleepTargetPreferenceMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: updateSleepTargetPreference,
    onSuccess: (preference: SleepTargetPreference) => {
      queryClient.setQueryData(sleepTargetPreferenceKey, preference);
    },
  });
}
