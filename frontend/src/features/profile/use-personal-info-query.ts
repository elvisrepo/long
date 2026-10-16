import { useQuery } from "@tanstack/react-query";
import { getPersonalInfo } from "./personal-info-api";

export function usePersonalInfoQuery() {
  return useQuery({
    queryKey: ["personal-info"],
    queryFn: getPersonalInfo,
    // Refresh estimates when a phone sync supplies a newer weight.
    refetchInterval: 60_000,
  });
}
