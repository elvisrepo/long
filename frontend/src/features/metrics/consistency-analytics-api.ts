import { getAccessToken } from "../auth/auth-session";

export interface ConsistencyMetric {
  metric_definition_id: string;
  name: string;
  slug: string;
  tracked_days: number;
  current_window_streak_days: number;
  last_recorded_at: string | null;
  day_presence: boolean[];
}

export interface ConsistencyAnalytics {
  range_days: number;
  dates: string[];
  metrics: ConsistencyMetric[];
  summary: {
    metrics_with_data: number;
    total_metrics: number;
    days_with_any_data: number;
  };
}

export async function getConsistencyAnalytics(): Promise<ConsistencyAnalytics> {
  const accessToken = getAccessToken();
  if (!accessToken) {
    throw new Error("Authentication required");
  }

  const response = await fetch("/api/v1/metrics/analytics/consistency/", {
    method: "GET",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) {
    throw new Error(
      await readConsistencyError(
        response,
        "Consistency analytics failed to load",
      ),
    );
  }

  return response.json();
}

async function readConsistencyError(
  response: Response,
  fallback: string,
): Promise<string> {
  try {
    const body: unknown = await response.json();
    if (body && typeof body === "object") {
      const detail = (body as Record<string, unknown>).detail;
      if (typeof detail === "string") {
        return detail;
      }
    }
  } catch {
    return fallback;
  }

  return fallback;
}
