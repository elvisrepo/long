import { getAccessToken } from "../auth/auth-session";

export interface SleepInsightsPoint {
  date: string;
  duration_minutes: number | null;
  period_start: string | null;
  recorded_at: string | null;
  shortfall_minutes: number | null;
}

export interface SleepInsightsSummary {
  tracked_nights: number;
  nights_under_target: number;
  total_shortfall_minutes: number;
  average_duration_minutes: number | null;
  worst_night: {
    date: string;
    duration_minutes: number;
  } | null;
}

export interface SleepInsights {
  range_days: 7;
  target_minutes: number;
  series: SleepInsightsPoint[];
  summary: SleepInsightsSummary;
}

export async function getSleepInsights(
  targetMinutes: number,
): Promise<SleepInsights> {
  const accessToken = getAccessToken();
  if (!accessToken) {
    throw new Error("Authentication required");
  }

  const response = await fetch(
    `/api/v1/metrics/analytics/sleep/?target_minutes=${targetMinutes}`,
    {
      method: "GET",
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  );

  if (!response.ok) {
    throw new Error(
      await readSleepInsightsError(response, "Sleep insights failed to load"),
    );
  }

  return response.json();
}

async function readSleepInsightsError(
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
