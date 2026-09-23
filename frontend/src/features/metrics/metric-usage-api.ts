import { getAccessToken } from "../auth/auth-session";

export interface MetricUsage {
  active_custom_metrics: {
    used: number;
    limit: number;
  };
}

export async function getMetricUsage(): Promise<MetricUsage> {
  const accessToken = getAccessToken();

  if (!accessToken) {
    throw new Error("Authentication required");
  }

  const response = await fetch("/api/v1/metrics/usage/", {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    throw new Error("Metric usage failed to load");
  }

  return response.json() as Promise<MetricUsage>;
}
