import { getAccessToken } from "../auth/auth-session";

export type WeightStepsRange = 7 | 30 | 90;

export interface WeightStepsPoint {
  date: string;
  weight_kg: number | null;
  steps: number | null;
}

export interface WeightStepsSummary {
  weight_start_kg: number | null;
  weight_end_kg: number | null;
  weight_change_kg: number | null;
  average_daily_steps: number | null;
}

export interface WeightStepsAnalytics {
  range_days: WeightStepsRange;
  series: WeightStepsPoint[];
  summary: WeightStepsSummary;
}

export async function getWeightStepsAnalytics(
  days: WeightStepsRange,
): Promise<WeightStepsAnalytics> {
  const accessToken = getAccessToken();

  if (!accessToken) {
    throw new Error("Authentication required");
  }

  const response = await fetch(
    `/api/v1/metrics/analytics/weight-steps/?days=${days}`,
    {
      method: "GET",
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  );

  if (!response.ok) {
    throw new Error(
      await readAnalyticsError(
        response,
        "Weight and steps analytics failed to load",
      ),
    );
  }

  return response.json();
}

async function readAnalyticsError(
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
